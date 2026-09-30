// 调试：确认后撤销是否真正回退对象树
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto('http://localhost:1420', { waitUntil: 'domcontentloaded' });
await page.locator('textarea').waitFor();
await sleep(800);

const dump = async (tag) => {
  const info = await page.evaluate(() => {
    const asides = document.querySelectorAll('aside');
    const tree = asides[0];
    const badge = document.querySelector('header span:last-child')?.textContent ?? '?';
    return {
      treeHeader: tree.querySelector('div')?.textContent ?? '?',
      nodeTexts: [...tree.querySelectorAll('span.truncate, span.flex-1')].map((s) => s.textContent),
      headerBadge: badge,
      undoDisabled: [...document.querySelectorAll('button')].find((b) => b.textContent.includes('撤销'))?.disabled,
      buttons: [...document.querySelectorAll('header button')].map((b) => `${b.textContent.trim()}(${b.disabled ? 'd' : 'e'})`).join(' '),
    };
  });
  console.log(`[${tag}]`, JSON.stringify(info));
};

await dump('initial');
await page.locator('textarea').fill('创建一个工作台');
await page.locator('textarea').press('Enter');
await page.getByRole('button', { name: '确认应用' }).waitFor({ timeout: 8000 });
await sleep(300);
await dump('preview');

const confirmBtn = page.getByRole('button', { name: '确认应用' });
await confirmBtn.click();
await sleep(400);
await dump('confirmed');

for (let i = 1; i <= 6; i++) {
  await page.getByRole('button', { name: '↺ 撤销' }).click({ trial: false });
  await sleep(400);
  await dump(`after-undo-click-${i}`);
}

await browser.close();
