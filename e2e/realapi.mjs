// 真实 API 链路验证：驱动应用做「测试连接 + 真实生成」
// 用法：$env:CHAT3D_CFG='{\"baseURL\":..,\"apiKey\":..,\"model\":..}'; node e2e/realapi.mjs
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:1420';

const raw = process.env.CHAT3D_CFG;
if (!raw) { console.error('CHAT3D_CFG not set'); process.exit(2); }
const cfg = JSON.parse(raw);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond) => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('  pageerror:', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.locator('textarea').waitFor({ timeout: 10000 });
await sleep(600);

// 1. 打开模型配置对话框
await page.getByRole('button', { name: '模型配置' }).click();
await sleep(400);
const dialog = page.locator('.fixed.inset-0');
await dialog.waitFor({ timeout: 5000 });
ok('对话框打开', (await dialog.count()) > 0);

// 2. 填入真实配置并测试连接
await dialog.locator('input[type="text"]').nth(0).fill(cfg.baseURL);
await dialog.locator('input[type="password"]').fill(cfg.apiKey);
await dialog.locator('input[type="text"]').nth(1).fill(cfg.model);
await dialog.getByRole('button', { name: '测试连接' }).click();

const msg = dialog.locator('.text-xs.rounded');
await msg.waitFor({ timeout: 30000 });
await sleep(300);
const testText = (await msg.textContent()) ?? '';
console.log('  测试连接返回：', testText.slice(0, 200));
ok('测试连接成功', testText.includes('连接成功'));

// 3. 保存配置
await dialog.getByRole('button', { name: '保存' }).click();
await sleep(500);
const badge = await page.locator('body').textContent() ?? '';
ok('角标显示模型名', badge.includes('模型：') && badge.includes(cfg.model));

// 4. 真实生成一次
await page.locator('textarea').fill('创建一个工作台，台面 1.6m x 0.8m，高 0.75m，四条方腿');
await page.locator('textarea').press('Enter');
await sleep(1500);

// 等待预览出现（助手消息 + 确认按钮）
const confirmBtn = page.getByRole('button', { name: /确认应用|应用变更/ }).first();
let confirmed = false;
for (let i = 0; i < 40; i++) {
  if ((await confirmBtn.count()) > 0) { confirmed = true; break; }
  await sleep(1000);
}
ok('真实生成：预览出现（确认按钮）', confirmed);
if (confirmed) {
  // 用对象树节点判定（比聊天消息文本选择器稳）
  const aside = page.locator('aside').first();
  const nodeCount = await aside.getByText(/桌面|桌腿/).count();
  ok('真实生成：对象树出现工作台节点', nodeCount >= 2);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} 项断言通过 ====`);
await browser.close();
process.exit(failed.length ? 1 : 0);
