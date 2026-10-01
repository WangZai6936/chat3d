import assert from 'node:assert/strict';
import {createServer} from 'vite';
import * as THREE from 'three';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
try{
 const {buildPrimitiveGeometry}=await server.ssrLoadModule('/src/scene/geometry.ts');
 const {parseModelResponse,buildSystemPrompt}=await server.ssrLoadModule('/src/ai/provider.ts');
 const {validateGeometry}=await server.ssrLoadModule('/src/domain/types.ts');
 const {createInitialDoc,useEditorStore:store}=await server.ssrLoadModule('/src/store.ts');
 const {applyBatch}=await server.ssrLoadModule('/src/domain/commands.ts');
 const {serializeProject,parseProject}=await server.ssrLoadModule('/src/domain/project.ts');
 const geometries=[{type:'frame',params:{width:2,height:1.5,depth:.1,thickness:.1}},{type:'tube',params:{outerRadius:.3,innerRadius:.2,height:.6}},{type:'capsule',params:{radius:.08,length:.4}},{type:'trapezoid',params:{widthTop:.5,widthBottom:1,height:1.5,depth:.6}}];
 await test('new generic geometries retain bounds and have real open centers',()=>{
  for(const g of geometries){assert.equal(validateGeometry(g).length,0);const geo=buildPrimitiveGeometry(g);geo.computeBoundingBox();assert.ok(geo.boundingBox.max.y>geo.boundingBox.min.y);const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
   if(g.type==='frame'){assert.equal(new THREE.Raycaster(new THREE.Vector3(0,0,2),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length,0);assert.ok(new THREE.Raycaster(new THREE.Vector3(.96,0,2),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length);}
   if(g.type==='tube')assert.equal(new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0);
   if(g.type==='capsule')assert.ok(Math.abs(geo.boundingBox.max.y-geo.boundingBox.min.y-.56)<1e-6);
   geo.dispose();mesh.material.dispose();
  }
 });
 await test('invalid apertures and dimensions rejected before applying',()=>{for(const g of [{type:'frame',params:{width:1,height:1,depth:.1,thickness:.5}},{type:'tube',params:{outerRadius:.2,innerRadius:.3,height:1}},{type:'capsule',params:{radius:-1,length:.4}},{type:'trapezoid',params:{widthTop:0,widthBottom:1,height:1,depth:1}}])assert.ok(validateGeometry(g).length)});
 await test('new shapes and materials parse, group, save, load, and undo without presets',()=>{
  const parsed=parseModelResponse(JSON.stringify({summary:'自由组合',operations:[{op:'createAssembly',name:'测试结构',parts:geometries.map((geometry,i)=>({name:geometry.type,geometry,materialId:['mat_paint','mat_brushed','mat_fabric','mat_floor'][i],transform:{position:[i,1,0],rotationDegrees:[0,0,i===2?30:0]}}))}]}));
  assert.equal(parsed.operations.length,1);const base=createInitialDoc(),r=applyBatch(base,parsed);assert.equal(r.errors.length,0);assert.equal(r.doc.nodes.length,4);assert.ok(r.doc.nodes[2].transform.rotationQuaternion[2]>.2);const loaded=parseProject(serializeProject(r.doc));assert.deepEqual(loaded.nodes,r.doc.nodes);
  store.setState({doc:base,past:[],future:[],aiStatus:'idle',pendingBatch:null,pendingResult:null});assert.equal(store.getState().applyCommandBatch(parsed.operations,'结构测试').ok,true);store.getState().undo();assert.equal(store.getState().doc.nodes.length,0);store.getState().redo();assert.equal(store.getState().doc.nodes.length,4);
 });
 await test('prompt exposes geometry and distinct surface materials rather than old ten-color ceiling',()=>{const p=buildSystemPrompt({nodes:[],selection:[]});for(const word of ['capsule','trapezoid','frame','tube','mat_floor','mat_glass','mat_fabric','rotationDegrees'])assert.ok(p.includes(word));assert.ok(!p.includes('预算约 40'))});
 console.log(`${passed} visual capability checks passed`);
}finally{await server.close()}
