import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import {createServer} from 'vite';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Element','CustomEvent','Node','NodeFilter','MutationObserver','Event','MouseEvent','localStorage','location','DocumentFragment'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.indexedDB=indexedDB;globalThis.getComputedStyle=dom.window.getComputedStyle;globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;window.requestAnimationFrame=globalThis.requestAnimationFrame;window.cancelAnimationFrame=globalThis.cancelAnimationFrame;globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=()=>{};
const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {Theme}=await import('@radix-ui/themes');
const server=await createServer({plugins:[{name:'workbench-viewport-fixture',enforce:'pre',load(id){if(id.endsWith('/src/ui/ViewportPanel.tsx'))return "import React from 'react';export function ViewportPanel(){return React.createElement('div',{'data-testid':'viewport-fixture'});}";}}],server:{middlewareMode:true},appType:'custom'});let passed=0;
try{
 const {default:App}=await server.ssrLoadModule('/src/App.tsx');const w=await server.ssrLoadModule('/src/workspace.ts');const {useEditorStore:editor}=await server.ssrLoadModule('/src/store.ts');
 await w.initializeWorkspace();await w.flushWorkspace();
 const ui=render(React.createElement(App));const input=ui.getByRole('textbox',{name:'建模指令'});fireEvent.change(input,{target:{value:'保留我的输入草稿'}});
 fireEvent.click(ui.getByRole('tab',{name:'任务记录'}));assert.equal(ui.getByRole('tab',{name:'任务记录'}).getAttribute('aria-selected'),'true');assert.ok(ui.getByRole('heading',{name:'任务与执行记录'}));assert.equal(document.querySelector('[aria-label="建模指令"]'),input);assert.equal(input.value,'保留我的输入草稿');
 fireEvent.click(ui.getByRole('button',{name:'前往对话'}));assert.equal(ui.getByRole('textbox',{name:'建模指令'}),input);console.log('PASS switching task and chat panes retains the same mounted composer and draft');passed++;
 fireEvent.keyDown(ui.getByRole('tab',{name:'对话',exact:true}),{key:'ArrowRight'});assert.equal(document.activeElement.id,'task-tab');fireEvent.keyDown(ui.getByRole('tab',{name:'任务记录'}),{key:'Home'});assert.equal(document.activeElement.id,'chat-tab');console.log('PASS assistant tabs support keyboard navigation and selection');passed++;
 fireEvent.click(ui.getByRole('button',{name:'专注场景'}));assert.ok(document.querySelector('.studio.focus-scene'));assert.equal(document.querySelector('[aria-label="建模指令"]'),input);fireEvent.keyDown(window,{key:'Escape'});assert.ok(!document.querySelector('.studio.focus-scene'));assert.equal(input.value,'保留我的输入草稿');console.log('PASS scene focus is reversible and does not unmount live chat');passed++;
 await act(async()=>editor.setState({aiStatus:'generating'}));fireEvent.click(ui.getByRole('tab',{name:'任务记录'}));assert.ok(ui.getByText('正在执行'));assert.equal(editor.getState().aiStatus,'generating');fireEvent.click(ui.getByRole('button',{name:'返回对话 / 停止生成'}));assert.equal(editor.getState().aiStatus,'generating');console.log('PASS task pane navigation never cancels an active generation');passed++;

 await act(async()=>editor.setState({lastRun:{title:'调整设备',turn:2,toolCalls:3,characters:50,inputTokens:0,outputTokens:0,usageReported:false,lastEventAt:Date.now(),plan:['检查选中设备','修改外壳'],events:['已读取场景'],timings:[]}}));fireEvent.click(ui.getByRole('tab',{name:'任务记录'}));assert.ok(ui.getByText('—'));assert.ok(ui.getByText('计划不等于完成结果，实际状态以执行记录和预览为准'));assert.equal(editor.getState().doc.nodes.length,0);console.log('PASS task record uses actual reported data and does not fabricate cost or completion');passed++;
 await act(async()=>editor.setState({aiStatus:'idle'}));await act(async()=>w.flushWorkspace());console.log(`${passed} workbench interaction checks passed with a fixture viewport`);
}finally{cleanup();await server.close();dom.window.close()}
