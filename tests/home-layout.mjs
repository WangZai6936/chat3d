import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const legacyNavConflict = `
.canvas-studio.frosted-studio .navigation-utilities .rt-Button{width:36px;min-width:36px;height:36px;border-radius:50%}
.canvas-studio.frosted-studio .navigation-utilities .rt-Button svg{width:16px;height:16px}
`;
const css =
  legacyNavConflict +
  fs.readFileSync('src/ui/studio/tokens.css', 'utf8') +
  fs.readFileSync('src/home-command-center.css', 'utf8') +
  fs.readFileSync('src/ui/library-category-tree.css', 'utf8') +
  fs.readFileSync('src/ui/app-update.css', 'utf8') +
  fs.readFileSync('src/ui/task-queue.css', 'utf8') +
  fs.readFileSync('src/ui/studio/studio-shell.css', 'utf8') +
  fs.readFileSync('src/ui/studio/studio-home.css', 'utf8');

const dom = new JSDOM(
  `<style>${css}</style>
<div class="redesigned-studio canvas-studio frosted-studio manager-mode">
  <nav class="navigation-utilities studio-shell-utilities">
    <button type="button" class="rt-Button app-update-nav-entry" title="关于与更新">
      <span class="app-update-nav-label">关于与更新</span>
      <span class="app-update-nav-badge">新</span>
    </button>
    <button type="button" class="rt-Button global-task-trigger" aria-label="任务"><span class="global-task-count">2</span></button>
  </nav>
  <main class="home-page home-command-center">
    <header class="home-hero"><p class="home-hero-lead">工作室</p></header>
    <section class="home-creation">
      <div class="home-create-column">
        <form class="home-composer"><button class="home-start composer-send">开始生成</button></form>
      </div>
      <section class="home-current-tasks"></section>
    </section>
    <div class="home-recent"></div>
  </main>
  <main class="resource-page">
    <aside class="library-category-tree">
      <button aria-pressed="true"><span>设备</span><small>2</small></button>
      <button class="is-child"><span>机床</span><small>1</small></button>
    </aside>
  </main>
</div>`,
);

const style = s => dom.window.getComputedStyle(dom.window.document.querySelector(s));

const update = style('.app-update-nav-entry');
const task = style('.global-task-trigger');
assert.notEqual(update.width, '36px', '关于与更新 must not use legacy 36px icon circle width');
assert.equal(update.flexShrink, '0');
assert.ok(task.width === '40px' || task.width === 'var(--sc-utility-size)', `task trigger width: ${task.width}`);
assert.ok(task.minWidth === '40px' || task.minWidth === 'var(--sc-utility-size)', `task trigger min-width: ${task.minWidth}`);
assert.equal(task.flexShrink, '0');
const utilGap = style('.navigation-utilities.studio-shell-utilities').gap;
assert.ok(utilGap === '12px' || utilGap === 'var(--sc-space-3)', `utilities gap: ${utilGap}`);
console.log('PASS header utilities keep separate boxes (no 关于与更新 / task overlap)');

assert.equal(style('.home-creation').display, 'grid');
assert.equal(style('.home-recent').gridTemplateColumns.replace(/\s+/g, ''), 'repeat(4,minmax(0,1fr))');
assert.equal(style('.home-start').width, 'auto');
assert.equal(style('.home-page').overflow, 'visible');
assert.ok(style('.home-hero').borderRadius !== '0px', 'home hero band is styled');
console.log('PASS approved home uses two main areas and one four-column gallery without nested page scrolling');

assert.equal(style('.library-category-tree button').borderTopWidth, '0px');
assert.equal(style('.library-category-tree button').textAlign, 'left');
assert.equal(style('.is-child').paddingLeft, '28px');
assert.equal(style('.library-category-tree button').justifyContent, 'space-between');
console.log('PASS shared category navigation removes boxed rows and aligns names counts and nested depth');

dom.window.close();
