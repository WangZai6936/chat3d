import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
// Real local Chromium/SwiftShader raster test. No model or paid API requests.
const server=await createServer({server:{port:5193,host:'127.0.0.1',strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.route('**/api/**',route=>route.fulfill({status:503,body:'offline test: external services disabled'}));
 await page.goto('http://127.0.0.1:5193');
 const results=await page.evaluate(async()=>{
  const {createInitialDoc,useEditorStore}=await import('/src/store.ts');
  const {applyBatch}=await import('/src/domain/commands.ts');
  const {captureIsolatedSceneEvidence}=await import('/src/scene/capture.ts');
  const {initializeWorkspace}=await import('/src/workspace.ts');await initializeWorkspace();
  const base=createInitialDoc();
  const scene=(name,color,shape)=>applyBatch({...structuredClone(base),projectId:name,materials:[{id:'test',baseColor:color,roughness:.6,metalness:0}]},{operations:[{op:'createPrimitive',name,parentId:null,materialId:'test',geometry:shape,transform:{position:[0,.5,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]}}]}).doc;
  const a=scene('capture-A','#ee2222',{type:'box',params:{width:1,height:1,depth:1}}),b=scene('capture-B','#2222ee',{type:'sphere',params:{radius:.5}});
  const activeBefore=useEditorStore.getState().doc;
  const [first,second]=await Promise.all([captureIsolatedSceneEvidence(a,'front'),captureIsolatedSceneEvidence(b,'side')]);
  const again=await captureIsolatedSceneEvidence(a,'front');
  const pixels=async image=>{const img=new Image();img.src=image;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(img.width/2,img.height/2,1,1).data;return [...data];};
  return {first:{...first,image:undefined},second:{...second,image:undefined},aPixel:await pixels(first.image),bPixel:await pixels(second.image),sameA:first.image===again.image,different:first.image!==second.image,unchanged:activeBefore===useEditorStore.getState().doc,offscreenHosts:document.querySelectorAll('[aria-hidden="true"][style*="-12000px"]').length};
 });
 assert.equal(results.first.backend,'webgl');assert.equal(results.second.backend,'webgl');assert.equal(results.first.projectId,'capture-A');assert.equal(results.second.projectId,'capture-B');assert.equal(results.first.view,'front');assert.equal(results.second.view,'side');assert.equal(results.different,true);assert.equal(results.sameA,true);assert.equal(results.unchanged,true);assert.equal(results.offscreenHosts,1);assert.ok(results.aPixel[0]>results.aPixel[2]);assert.ok(results.bPixel[2]>results.bPixel[0]);
 console.log('PASS dedicated GPU captures serialize real red/blue scenes, bind evidence, preserve active editor, and reproduce exact A image after B');console.log(JSON.stringify(results));
}finally{await browser.close();await server.close();}
