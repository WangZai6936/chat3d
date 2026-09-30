// chat3d 补充冒烟：模拟模型扩展语句 + 失败后对话不卡死
// 用法：先启动 vite，再 `node e2e/smoke2.mjs`
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:1420';

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
const ta = page.locator('textarea');
await ta.waitFor({ timeout: 10000 });
await sleep(800);

// 未配置模型时默认不生成：显式打开离线演示模式（模拟回包）跑后续冒烟
await page.evaluate(async () => {
  const m = await import('/src/store.ts');
  m.useEditorStore.getState().setAiConfig({ baseURL: '', apiKey: '', model: '', useMock: true });
});
await sleep(300);

// ---- 闲聊 ----
await ta.fill('你好啊');
await ta.press('Enter');
await sleep(1600);
ok('闲聊：助手回复问候', await page.getByText(/我是建模助手/).isVisible());
ok('闲聊后：输入框仍可用', await ta.isEnabled());

// ---- 未识别 → 不卡死 ----
await ta.fill('吧啦吧啦无意义的话xyz');
await ta.press('Enter');
await sleep(1600);
ok('未识别：回复提示清单', await page.getByText(/这句话我还没学会/).isVisible());
ok('未识别后：输入框仍可用（核心修复）', await ta.isEnabled());
const sendBtn = page.getByRole('button', { name: '发送' });
ok('未识别后：空输入时发送按钮禁用（正常）', !(await sendBtn.isEnabled()));
await ta.fill('测试内容');
ok('未识别后：输入内容即恢复可发送', await sendBtn.isEnabled());
await ta.fill('');

// ---- 未识别后再发有效指令：链路恢复 ----
await ta.fill('创建 3 层货架');
await ta.press('Enter');
const confirmBtn = page.getByRole('button', { name: '确认应用' });
await confirmBtn.waitFor({ timeout: 8000 });
await sleep(300);
ok('货架预览：确认按钮出现', true);
ok('货架预览：摘要含 4 立柱', (await page.getByText(/4 立柱 \+ 3 层板/).first().isVisible()));
ok('货架预览：对象树 7 节点（4 立柱 + 3 层板）', (await page.getByText('对象树 · 7').isVisible()));

// 放弃预览，回到就绪
await page.getByRole('button', { name: '放弃' }).first().click();
await sleep(400);
ok('放弃后：状态回到就绪', await page.getByText('就绪').first().isVisible());

// ---- 选中对象修改：油桶再改名 ----
await ta.fill('创建一个油桶');
await ta.press('Enter');
await page.getByRole('button', { name: '确认应用' }).waitFor({ timeout: 8000 });
await page.getByRole('button', { name: '确认应用' }).click();
await sleep(400);
ok('油桶已应用：树上出现「桶」', await page.getByText('桶', { exact: true }).isVisible());

// 选中它
await page.locator('aside').first().getByText('桶', { exact: true }).click();
await sleep(200);
ok('选中「桶」后属性面板出现', await page.getByText(/位置 X \/ Y \/ Z/).isVisible());

await ta.fill('向左移动 0.5 米');
await ta.press('Enter');
await page.getByRole('button', { name: '确认应用' }).waitFor({ timeout: 8000 });
await sleep(200);
ok('移动指令：预览出现', (await page.getByText(/向左移动 0\.5m/).first().isVisible()));
await page.getByRole('button', { name: '确认应用' }).click();
await sleep(400);
ok('移动后：未保存角标更新', await page.getByText(/未保存/).isVisible());

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} 项断言通过 ====`);
if (failed.length) failed.forEach((r) => console.log('  - ' + r.name));
await browser.close();
process.exit(failed.length ? 1 : 0);
