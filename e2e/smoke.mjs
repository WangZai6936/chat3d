// chat3d 端到端冒烟测试（Playwright 驱动 Vite dev server 中的同一个 React 应用）
// 覆盖 P0 核心闭环：输入「创建一个工作台」→ 模拟 AI 管线 → 预览 → 确认应用 → 撤销 → 重做
// DOM 断言在此完成；canvas 渲染像素分析由外层 PowerShell 对 e2e/shots/canvas-*.png 统计
// 用法：先启动 vite（node node_modules/vite/bin/vite.js），再 `node e2e/smoke.mjs`
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:1420';
const SHOTS = 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`);
};

// canvas 元素截图（浏览器合成后的真实内容）；像素统计交给外层 PowerShell
async function shotCanvas(page, name) {
  await page.locator('canvas').screenshot({ path: `${SHOTS}/canvas-${name}.png` });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text()); });
page.on('pageerror', (e) => console.log('  pageerror:', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
const ta = page.locator('textarea');
await ta.waitFor({ timeout: 10000 });
ok('应用加载（textarea 就绪）', true);
await sleep(800); // 等 Three.js 首帧

// ---- 空场景基线 ----
ok('空场景：canvas 存在', await page.locator('canvas').isVisible());
await shotCanvas(page, 'empty');
ok('空场景：对象树显示「空场景」', (await page.getByText('空场景').isVisible()));
ok('空场景：头部角标 0 个对象', (await page.getByText('0 个对象', { exact: false }).first().isVisible()));
const undoBtn = page.getByRole('button', { name: '↺ 撤销' });
ok('空场景：撤销按钮禁用', await undoBtn.isDisabled());
await page.screenshot({ path: `${SHOTS}/empty.png` });

// ---- 未配置模型时的引导（默认不内置生成）----
ok('工具栏：显示「模型配置」按钮', (await page.getByRole('button', { name: '模型配置' }).isVisible()));
ok('工具栏：显示「未配置模型」角标', (await page.getByText('未配置模型').isVisible()));
await ta.fill('创建一个工作台');
await ta.press('Enter');
await sleep(1000);
ok('未配置：助手引导去「模型配置」', await page.getByText(/还没有配置模型/).isVisible());

// ---- 打开离线演示模式（模拟回包），恢复生成链路 ----
await page.evaluate(async () => {
  const m = await import('/src/store.ts');
  m.useEditorStore.getState().setAiConfig({ baseURL: '', apiKey: '', model: '', useMock: true });
});
await sleep(300);
ok('开启演示模式后：角标变为演示模式', (await page.getByText('演示模式（模拟回包）').isVisible()));

// ---- 发送消息 ----
await ta.fill('创建一个工作台');
await ta.press('Enter');
console.log('已发送：创建一个工作台');

// ---- 等待预览态（模拟管线约 1.1s）----
const confirmBtn = page.getByRole('button', { name: '确认应用' });
await confirmBtn.waitFor({ timeout: 8000 });
await sleep(300);
ok('预览态：确认应用按钮出现', true);

ok('预览态：状态行显示预览中', (await page.getByText(/预览中：创建工作台/).first().isVisible()));
ok('预览态：助手消息包含工作台说明', (await page.getByText(/创建工作台：长\s*2m/).first().isVisible()));
ok('预览态：头部「预览待确认」角标', (await page.getByText('预览待确认').isVisible()));
ok('预览态：头部角标 5 个对象', (await page.getByText('5 个对象', { exact: false }).first().isVisible()));
ok('预览态：撤销按钮禁用（冻结历史）', await undoBtn.isDisabled());

// 对象树：预览副本驱动，应出现 5 个节点
for (const name of ['桌面', '桌腿1', '桌腿2', '桌腿3', '桌腿4']) {
  const node = page.locator('aside').first().getByText(name, { exact: true });
  const visible = await node.isVisible().catch(() => false);
  results.push({ name: `预览态：对象树节点「${name}」`, pass: visible, extra: '' });
  console.log(`${visible ? 'PASS' : 'FAIL'}  预览态：对象树节点「${name}」`);
}
ok('预览态：对象树计数 · 5', (await page.getByText('对象树 · 5').isVisible()));
await shotCanvas(page, 'preview');
await page.screenshot({ path: `${SHOTS}/preview.png` });

// ---- 确认应用 ----
await confirmBtn.click();
await sleep(400);
ok('确认后：状态回到就绪', (await page.getByText('就绪').first().isVisible()));
ok('确认后：预览角标消失', !(await page.getByText('预览待确认').isVisible().catch(() => false)));
ok('确认后：对象树仍有 5 节点（镜像基线）', (await page.getByText('对象树 · 5').isVisible()));
ok('确认后：未保存角标', (await page.getByText(/未保存 · 5 个对象/).first().isVisible().catch(() => false)));
ok('确认后：撤销按钮可用', !(await undoBtn.isDisabled()));
await page.screenshot({ path: `${SHOTS}/committed.png` });

// ---- 撤销 ----
await undoBtn.click();
await sleep(400);
ok('撤销后：对象树清空', (await page.getByText('对象树 · 0').isVisible()));
ok('撤销后：空场景提示', (await page.getByText('空场景').isVisible()));
await shotCanvas(page, 'undo');
await page.screenshot({ path: `${SHOTS}/undo.png` });

// ---- 重做 ----
await page.getByRole('button', { name: '↻ 重做' }).click();
await sleep(400);
ok('重做后：对象树恢复 5 节点', (await page.getByText('对象树 · 5').isVisible()));
ok('重做后：头部 5 个对象', (await page.getByText('5 个对象', { exact: false }).first().isVisible()));
await shotCanvas(page, 'redo');
await page.screenshot({ path: `${SHOTS}/redo.png` });

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} 项 DOM 断言通过 ====`);
if (failed.length) {
  console.log('失败项：');
  failed.forEach((r) => console.log('  - ' + r.name + (r.extra ? ' :: ' + r.extra : '')));
}
await browser.close();
process.exit(failed.length ? 1 : 0);
