import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React from 'react';
import {createServer} from 'vite';
const dom=new JSDOM('<html><body></body></html>',{url:'https://example.test'});
for(const name of ['window','document','HTMLElement','Node','MutationObserver','Event','MouseEvent','localStorage'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,cleanup,act}=await import('@testing-library/react');
globalThis.viewportFails=true;
const server=await createServer({plugins:[{name:'failing-viewport',enforce:'pre',load(id){if(id.endsWith('/src/scene/Viewport.ts'))return `export class Viewport {constructor(host){if(globalThis.viewportFails)throw new Error('WebGL unavailable');this.canvas=document.createElement('canvas');host.appendChild(this.canvas)}setPlaybackListener(){}sync(){}start(){}setGridVisible(){}setBackdrop(){}setSelection(){}captureDocument(){return Promise.resolve('fixture')}dispose(){this.canvas.remove()}}`;}}],server:{middlewareMode:true},appType:'custom'});
try{
 const {ViewportPanel}=await server.ssrLoadModule('/src/ui/ViewportPanel.tsx');const {useEditorStore:s}=await server.ssrLoadModule('/src/store.ts');const {captureScene}=await server.ssrLoadModule('/src/scene/capture.ts');
 const ui=render(React.createElement(ViewportPanel));assert.equal(s.getState().viewportStatus,'error');assert.ok(ui.getByText('无法启动三维视图'));assert.equal(document.querySelector('.viewport-host').style.isolation,'isolate');await assert.rejects(captureScene(s.getState().doc,'front'),/未就绪/);console.log('PASS renderer startup failure propagates and cannot produce a capture');
 globalThis.viewportFails=false;fireEvent.click(ui.getByRole('button',{name:'重试视图'}));assert.equal(s.getState().viewportStatus,'ready');assert.equal(ui.queryByText('无法启动三维视图'),null);assert.equal(await captureScene(s.getState().doc,'front'),'fixture');console.log('PASS explicit renderer retry registers capture only after successful startup');
 act(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost')));assert.equal(s.getState().viewportStatus,'error');await assert.rejects(captureScene(s.getState().doc,'front'),/不可用/);console.log('PASS lost context invalidates readiness and screenshot claims');
 cleanup();assert.equal(s.getState().viewportStatus,'starting');await assert.rejects(captureScene(s.getState().doc,'front'),/未就绪/);console.log('PASS unmount clears renderer and capture registrations');
}finally{cleanup();await server.close();dom.window.close();delete globalThis.viewportFails;}
