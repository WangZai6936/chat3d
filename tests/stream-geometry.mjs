import assert from 'node:assert/strict';
import {createServer} from 'vite';
import * as THREE from 'three';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
try {
 const {readChatResponse}=await server.ssrLoadModule('/src/ai/stream.ts');
 const {parseModelResponse}=await server.ssrLoadModule('/src/ai/provider.ts');
 const {buildPrimitiveGeometry}=await server.ssrLoadModule('/src/scene/geometry.ts');
 const {validateGeometry}=await server.ssrLoadModule('/src/domain/types.ts');
 const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');
 const {parseProject,serializeProject}=await server.ssrLoadModule('/src/domain/project.ts');
 const enc=new TextEncoder();
 const event=t=>'data: '+JSON.stringify({choices:[{delta:{content:t}}]})+'\r\n\r\n';
 const response=(s,split=1)=>{const bytes=enc.encode(s);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=split)c.enqueue(bytes.slice(i,i+split));c.close()}}),{headers:{'content-type':'text/event-stream'}})};
 await test('SSE handles split UTF-8, CRLF and DONE; progress never exposes raw reasoning',async()=>{let progress=[];const raw=event('圆角')+'data: '+JSON.stringify({choices:[{delta:{reasoning_content:'internal'}}]})+'\r\n\r\n'+event('板件')+'data: [DONE]\r\n\r\n';assert.equal(await readChatResponse(response(raw),undefined,(...x)=>progress.push(x)),'圆角板件');assert.equal(progress.at(-1)[0],4)});
 await test('non-stream JSON compatibility preserved',async()=>{assert.equal(await readChatResponse(new Response(JSON.stringify({choices:[{message:{content:'final'}}]})),undefined,()=>{}),'final')});
 await test('truncated stream rejected without terminator; length cap rejected',async()=>{await assert.rejects(()=>readChatResponse(response(event('partial')),undefined,()=>{}),/中断/);await assert.rejects(()=>readChatResponse(response('data: '+JSON.stringify({choices:[{finish_reason:'length'}]})+'\n\n'),undefined,()=>{}),/长度/) });
 await test('stream errors and malformed data rejected',async()=>{for(const raw of ['data: broken\n\n','data: {"error":{"message":"bad"}}\n\n']) await assert.rejects(()=>readChatResponse(response(raw),undefined,()=>{}))});
 await test('abort settles a pending stream read',async()=>{const ctrl=new AbortController();const res=new Response(new ReadableStream({start(){}}),{headers:{'content-type':'text/event-stream'}});const promise=readChatResponse(res,ctrl.signal,()=>{});ctrl.abort();await assert.rejects(()=>promise,/停止/)});
 await test('clarifying answer with zero operations accepted; invalid operation still rejected',()=>{assert.equal(parseModelResponse('{"summary":"请提供尺寸","operations":[]}').operations.length,0);assert.throws(()=>parseModelResponse('{"summary":"x","operations":[{"op":"invalid"}]}'))});
 const geo={type:'roundedPlate',params:{width:1.1,height:0.03,depth:0.85,cornerRadius:0.2,holeRadius:0.18}};
 await test('rounded plate retains actual dimensions and center is genuinely open',()=>{assert.equal(validateGeometry(geo).length,0);const g=buildPrimitiveGeometry(geo);g.computeBoundingBox();const box=g.boundingBox;assert.ok(Math.abs(box.max.x-box.min.x-1.1)<1e-6);assert.ok(Math.abs(box.max.y-box.min.y-0.03)<1e-6);const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});const mesh=new THREE.Mesh(g,mat);mesh.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0);ray.set(new THREE.Vector3(.3,1,0),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(mesh).length>0);g.dispose();mat.dispose()});
 await test('invalid holes/radii rejected; solid rounded body supports zero hole',()=>{for(const params of [{...geo.params,holeRadius:.43},{...geo.params,cornerRadius:.6},{...geo.params,holeRadius:-1}])assert.ok(validateGeometry({...geo,params}).length);assert.equal(validateGeometry({...geo,params:{...geo.params,holeRadius:0}}).length,0)});
 await test('new colors valid and old project gains missing stock colors without replacing existing ones',()=>{const doc=createInitialDoc();assert.ok(doc.materials.some(m=>m.id==='mat_red'));const custom=doc.materials.find(m=>m.id==='mat_red');custom.baseColor='#abcdef';doc.materials=doc.materials.filter(m=>m.id!=='mat_cyan');const parsed=parseProject(serializeProject(doc));assert.equal(parsed.materials.find(m=>m.id==='mat_red').baseColor,'#abcdef');assert.ok(parsed.materials.some(m=>m.id==='mat_cyan'))});
 console.log(`${passed} stream/geometry checks passed`);
}finally{await server.close()}
