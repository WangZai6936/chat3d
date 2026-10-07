import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const css=readFileSync('src/thumbnail-layout.css','utf8');
const dom=new JSDOM(`<style>${css}</style><div class="canvas-studio frosted-studio manager-mode"><div class="home-project-link"><img></div><div class="resource-tile"><img></div><div class="resource-project-grid"><div class="resource-row"><img></div></div><div class="home-featured-open"><img></div><div class="home-featured-choices"><button><img></button></div><div class="resource-detail"><img></div><div class="resource-layout-list"><div class="resource-tile"><img></div></div><div class="canvas-asset-item"><img></div></div>`);
try {
 const style=e=>dom.window.getComputedStyle(e);
 for(const selector of ['.home-project-link img','.resource-tile img','.resource-project-grid img','.home-featured-open img','.home-featured-choices img','.resource-detail img']){
  const s=style(dom.window.document.querySelector(selector));assert.equal(s.objectFit,'cover',selector);assert.equal(s.aspectRatio,'4 / 3',selector);assert.equal(s.padding,'0px',selector);assert.equal(s.height,'auto',selector);
 }
 console.log('PASS home library drafts featured and details share borderless 4:3 cover frames');
 const choice=style(dom.window.document.querySelector('.home-featured-choices button'));assert.equal(choice.padding,'0px');assert.equal(choice.overflow,'hidden');
 console.log('PASS featured choices do not inset thumbnails within a padded white frame');
 const list=style(dom.window.document.querySelector('.resource-layout-list img'));assert.equal(list.width,'112px');assert.equal(list.height,'84px');assert.equal(list.objectFit,'cover');assert.equal(style(dom.window.document.querySelector('.canvas-asset-item img')).objectFit,'cover');
 console.log('PASS compact list and asset shelf fill their thumbnail regions');
 const app=readFileSync('src/App.tsx','utf8');assert.ok(app.indexOf("import './thumbnail-layout.css'")>app.indexOf("import './creative-gallery.css'"));
 console.log('PASS shared thumbnail rules load after legacy gallery dimensions');
} finally {dom.window.close();}
