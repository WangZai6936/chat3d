import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React from 'react';
import {createServer} from 'vite';
const dom=new JSDOM('<html><body></body></html>',{url:'https://example.test'});
for(const name of ['window','document','HTMLElement','Node','MutationObserver','Event','MouseEvent','localStorage'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,cleanup,act}=await import('@testing-library/react');
globalThis.viewportFails=true;globalThis.softwareCalls=[];
const server=await createServer({plugins:[{name:'failing-viewport',enforce:'pre',load(id){if(id.endsWith('/src/scene/softwareCapture.ts'))return `export const isSoftwareCaptureAvailable=()=>!!globalThis.softwareAvailable;export async function captureSoftware(doc,view,ids,signal){globalThis.softwareCalls.push({doc,view,ids,signal});return globalThis.softwareDeferred?await new Promise(resolve=>globalThis.softwareResolve=resolve):'data:image/png;base64,fixture'}`;if(id.endsWith('/src/scene/Viewport.ts'))return `export class Viewport {constructor(host){if(globalThis.viewportFails)throw new Error('WebGL unavailable');this.canvas=document.createElement('canvas');host.appendChild(this.canvas)}setPlaybackListener(){}sync(){}start(){}setGridVisible(){}setBackdrop(){}setSelection(){}captureDocument(){return Promise.resolve('fixture')}dispose(){this.canvas.remove()}}`;}}],server:{middlewareMode:true},appType:'custom'});
try{
 const {ViewportPanel}=await server.ssrLoadModule('/src/ui/ViewportPanel.tsx');const {useEditorStore:s}=await server.ssrLoadModule('/src/store.ts');const {captureScene}=await server.ssrLoadModule('/src/scene/capture.ts');
 const ui=render(React.createElement(ViewportPanel));assert.equal(s.getState().viewportStatus,'error');assert.ok(ui.getByText('无法启动三维视图'));assert.equal(document.querySelector('.viewport-host').style.isolation,'isolate');await assert.rejects(captureScene(s.getState().doc,'front'),/未就绪/);assert.equal(ui.getByRole('button',{name:'沙盘视角'}).disabled,true);assert.equal(ui.getByRole('button',{name:'适应场景'}).disabled,true);console.log('PASS renderer startup failure propagates and cannot produce a capture');
 globalThis.viewportFails=false;fireEvent.click(ui.getByRole('button',{name:'重试视图'}));assert.equal(s.getState().viewportStatus,'ready');assert.equal(ui.queryByText('无法启动三维视图'),null);assert.equal(await captureScene(s.getState().doc,'front'),'fixture');console.log('PASS explicit renderer retry registers capture only after successful startup');
 act(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost')));assert.equal(s.getState().viewportStatus,'error');await assert.rejects(captureScene(s.getState().doc,'front'),/不可用/);console.log('PASS lost context invalidates readiness and screenshot claims');
 cleanup();assert.equal(s.getState().viewportStatus,'starting');await assert.rejects(captureScene(s.getState().doc,'front'),/未就绪/);console.log('PASS unmount clears renderer and capture registrations');

 globalThis.softwareAvailable=true;
 const {SoftwareGeometryView}=await server.ssrLoadModule('/src/ui/SoftwareGeometryView.tsx');
 const base=s.getState().doc;const nodes=['a','b','c'].map((id,i)=>({id,name:id,visible:i!==2,geometry:{type:'box',params:{width:1,height:1,depth:1}},transform:{position:[i,0,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]}}));const doc={...base,nodes};
 const soft=render(React.createElement(SoftwareGeometryView,{doc,selection:['a']}));
 fireEvent.change(soft.getByLabelText('软件检查范围'),{target:{value:'focus'}});await act(async()=>fireEvent.click(soft.getByRole('button',{name:'生成软件检查图'})));
 assert.equal(globalThis.softwareCalls.at(-1).doc.nodes.length,3);assert.deepEqual(globalThis.softwareCalls.at(-1).ids,['a']);assert.ok(soft.getByAltText(/保留周边/));
 fireEvent.change(soft.getByLabelText('软件检查范围'),{target:{value:'isolated'}});assert.equal(soft.queryByRole('img'),null);await act(async()=>fireEvent.click(soft.getByRole('button',{name:'生成软件检查图'})));assert.deepEqual(globalThis.softwareCalls.at(-1).doc.nodes.map(n=>n.id),['a']);assert.ok(soft.getByText(/不能据此验收/));
 soft.rerender(React.createElement(SoftwareGeometryView,{doc,selection:['c']}));assert.equal(soft.queryByRole('img'),null);assert.equal(soft.getByRole('button',{name:'生成软件检查图'}).disabled,true);
 soft.rerender(React.createElement(SoftwareGeometryView,{doc,selection:['b']}));fireEvent.change(soft.getByLabelText('软件检查视角'),{target:{value:'left'}});await act(async()=>fireEvent.click(soft.getByRole('button',{name:'生成软件检查图'})));assert.equal(globalThis.softwareCalls.at(-1).view,'left');assert.deepEqual(globalThis.softwareCalls.at(-1).ids,['b']);
 globalThis.softwareDeferred=true;fireEvent.click(soft.getByRole('button',{name:'生成软件检查图'}));const pending=globalThis.softwareCalls.at(-1);fireEvent.change(soft.getByLabelText('软件检查范围'),{target:{value:'scene'}});assert.equal(pending.signal.aborted,true);await act(async()=>globalThis.softwareResolve('data:image/png;base64,stale'));assert.equal(soft.queryByRole('img'),null);
 console.log('PASS software close-up preserves context, isolation is explicit, and selection/view changes invalidate evidence');
}finally{cleanup();await server.close();dom.window.close();delete globalThis.viewportFails;delete globalThis.softwareCalls;delete globalThis.softwareAvailable;delete globalThis.softwareDeferred;delete globalThis.softwareResolve;}
