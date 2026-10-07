import {selectionRenderer} from './helpers/selection-renderer.mjs';
import assert from 'node:assert/strict';import{createServer}from'vite';import{JSDOM}from'jsdom';import{Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera,OrthographicCamera,BufferGeometry,Float32BufferAttribute,DoubleSide,Group}from'three';
const dom=new JSDOM('<!doctype html><div id="host"><canvas></canvas></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;
const server=await createServer({server:{middlewareMode:true},appType:'custom'});let count=0;const test=(name,f)=>{f();console.log('PASS '+name);count++};
try{
 const selectionModule=await server.ssrLoadModule('/src/scene/rectangleSelection.ts');const renderer=selectionRenderer();const rectangleObjectIds=(objects,camera,rect,wholeModel=false,options={})=>selectionModule.rectangleObjectIds(objects,camera,rect,wholeModel,{renderer,...options});const camera=new PerspectiveCamera(60,1,.1,100);camera.updateMatrixWorld();
 const object=(id,x,z,group,visible=true)=>{const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());mesh.position.set(x,0,z);mesh.visible=visible;mesh.updateMatrixWorld();return{id,object:mesh,assemblyId:group}};
 const objects=[object('left',-2,-5,'a'),object('right',2,-5,'b'),object('behind',0,5,'c'),object('hidden',0,-5,'a',false),object('offscreen',20,-5,'a')];
 test('rectangle selects projected overlapping objects and rejects behind-camera / hidden objects',()=>{assert.deepEqual(rectangleObjectIds(objects,camera,{left:-1,right:0,top:1,bottom:-1}),['left']);});
 test('reverse-direction and full-view drags have stable results',()=>{assert.deepEqual(rectangleObjectIds(objects,camera,{left:0,right:-1,top:-1,bottom:1}),['left']);assert.deepEqual(rectangleObjectIds(objects,camera,{left:-1,right:1,top:1,bottom:-1}),['left','right']);});
 test('whole-model selection includes hidden and offscreen siblings only after a visible member intersects',()=>{assert.deepEqual(rectangleObjectIds(objects,camera,{left:-1,right:0,top:1,bottom:-1},true),['left','hidden','offscreen']);});
 test('invalid or empty rectangles never fabricate selection',()=>{assert.deepEqual(rectangleObjectIds(objects,camera,{left:NaN,right:1,top:1,bottom:-1}),[]);assert.deepEqual(rectangleObjectIds(objects,camera,{left:-.05,right:.05,top:.05,bottom:-.05}),[]);});

 const full={left:-1,right:1,top:1,bottom:-1};
 test('visible default rejects fully occluded rear rack; through is explicit and off by default',()=>{
  const rear=object('rear',0,-7,'rear-group'),front=object('front',0,-4,'front-group');assert.deepEqual(rectangleObjectIds([rear,front],camera,full),['front']);assert.deepEqual(rectangleObjectIds([rear,front],camera,full,false,{through:true}),['rear','front']);
 });
 test('a projected bounding box corner without actual triangle area never selects',()=>{
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-1,-1,-5,1,-1,-5,-1,1,-5],3));const triangle={id:'triangle',object:new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide}))};
  const corner={left:.15,right:.3,bottom:.15,top:.3};assert.deepEqual(rectangleObjectIds([triangle],camera,corner),[]);assert.deepEqual(rectangleObjectIds([triangle],camera,corner,false,{through:true}),[]);
  assert.deepEqual(rectangleObjectIds([triangle],camera,{left:-.25,right:-.1,bottom:-.25,top:-.1},false,{through:true}),['triangle']);
 });
 test('thin dense bars do not act as a filled rack bounding box; true holes reveal rear parts',()=>{
  const bars=Array.from({length:16},(_,i)=>{const b=object('bar-'+i,-1.5+i*.2,-4,'rack');b.object.scale.set(.04,3,.1);return b});const rear=object('through-hole',0,-7,'other');rear.object.scale.set(.06,.2,1);
  const selected=rectangleObjectIds([...bars,rear],camera,full,false,{renderer:selectionRenderer(128,128)});assert.equal(selected.filter(id=>id.startsWith('bar-')).length,16);assert.ok(selected.includes('through-hole'));
  const cover=object('cover',0,-3,'wall');cover.object.scale.set(8,8,.1);assert.deepEqual(rectangleObjectIds([...bars,rear,cover],camera,full),['cover']);
 });
 test('partial surface intersection selects, full enclosure is not required, and hidden parents cannot occlude',()=>{
  const front=object('front',0,-3),rear=object('rear',0,-6);rear.object.scale.set(3,3,1);assert.deepEqual(rectangleObjectIds([front,rear],camera,full),['front','rear']);
  const hidden=new Group();hidden.visible=false;hidden.add(front.object);assert.deepEqual(rectangleObjectIds([front,rear],camera,full),['rear']);
  assert.deepEqual(rectangleObjectIds([rear],camera,{left:.45,right:.5,top:.2,bottom:-.2},false,{through:true}),['rear']);
 });
 test('perspective side/top and orthographic camera views select the nearest geometry',()=>{
  const ortho=new OrthographicCamera(-4,4,4,-4,.1,100);const rear=object('rear',0,-7),front=object('front',0,-4);assert.deepEqual(rectangleObjectIds([rear,front],ortho,full),['front']);
  const side=new PerspectiveCamera(60,1,.1,100);side.position.set(10,0,-5);side.lookAt(0,0,-5);const far=object('far',-2,-5),near=object('near',2,-5);assert.deepEqual(rectangleObjectIds([far,near],side,full),['near']);
  const top=new PerspectiveCamera(60,1,.1,100);top.position.set(0,10,-5);top.lookAt(0,0,-5);far.object.position.set(0,-2,-5);near.object.position.set(0,2,-5);assert.deepEqual(rectangleObjectIds([far,near],top,full),['near']);
 });
 test('near and far clipping, draw ranges, zero-opacity and invisible materials are respected',()=>{
  const near=object('near',0,-.08),far=object('far',0,-200);near.object.scale.set(.1,.1,.3);assert.deepEqual(rectangleObjectIds([near,far],camera,full,false,{through:true}),['near']);
  near.object.geometry.setDrawRange(0,0);assert.deepEqual(rectangleObjectIds([near],camera,full,false,{through:true}),[]);
  for(const key of ['visible','opacity']){const hidden=object(key,0,-4);hidden.object.material[key]=key==='visible'?false:0;assert.deepEqual(rectangleObjectIds([hidden],camera,full),[]);assert.deepEqual(rectangleObjectIds([hidden],camera,full,false,{through:true}),[]);}
 });
 test('default requires depth rendering and never silently falls back to through selection',()=>{assert.throws(()=>selectionModule.rectangleObjectIds(objects,camera,full),/三维视图/);});
 test('DPR 2 uses device-pixel render-target viewport without scaling a second time',()=>{const r=selectionRenderer(128,96,{pixelRatio:2,tileSize:32}),oldViewport=r.currentViewport.clone();const rows=[object('left',-2,-5),object('right',2,-5)];assert.deepEqual(rectangleObjectIds(rows,camera,full,false,{renderer:r}),['left','right']);assert.deepEqual(rectangleObjectIds(rows,camera,{left:-1,right:0,top:1,bottom:-1},false,{renderer:r}),['left']);assert.deepEqual(r.currentViewport,oldViewport);});
 test('ID readback tiles preserve RGB identifiers above 255 and renderer state on success or failure',()=>{
  const many=Array.from({length:1100},(_,i)=>object('id-'+i,0,-5));
  for(const failRead of [false,true]){const r=selectionRenderer(64,64,{raster:false,tileSize:32,failRead});const saved={viewport:r.viewport.clone(),scissor:r.scissor.clone(),color:r.color.clone()};const cameraBefore=camera.projectionMatrix.clone();let disposed=0;const render=r.render;r.render=function(scene,c){scene.children[0].material.addEventListener('dispose',()=>disposed++);return render.call(this,scene,c)};
   if(failRead)assert.throws(()=>rectangleObjectIds(many,camera,full,false,{renderer:r}),/readback/);else{const picked=rectangleObjectIds(many,camera,full,false,{renderer:r});assert.ok(picked.includes('id-1023'));assert.equal(r.renders,4);assert.equal(r.reads,4);}
   assert.equal(r.target,null);assert.equal(r.scissorTest,true);assert.deepEqual(r.viewport,saved.viewport);assert.deepEqual(r.scissor,saved.scissor);assert.deepEqual(r.color,saved.color);assert.equal(r.alpha,.4);assert.equal(r.autoClear,false);assert.equal(r.xr.enabled,true);assert.deepEqual(camera.projectionMatrix,cameraBefore);assert.ok(disposed>0);
  }
 });
 test('11200 nodes use a bounded tiled ID pass without CPU triangle/raycast traversal',()=>{
  const geometry=new BoxGeometry(.01,.01,.01),material=new MeshBasicMaterial(),many=Array.from({length:11200},(_,i)=>{const mesh=new Mesh(geometry,material);mesh.position.set(i%100/100,Math.floor(i/100)/100,-5);mesh.raycast=()=>{throw Error('production must not raycast')};return {id:'large-'+i,object:mesh}});const r=selectionRenderer(128,128,{raster:false});const start=performance.now();assert.equal(rectangleObjectIds(many,camera,full,false,{renderer:r}).length,11200);assert.equal(r.renders,1);assert.deepEqual(r.scenes,[11200]);console.log('  11200-node mocked ID setup/readback ms',Math.round(performance.now()-start));geometry.dispose();material.dispose();
 });
 const{Viewport}=await server.ssrLoadModule('/src/scene/Viewport.ts');const host=document.getElementById('host'),canvas=host.querySelector('canvas');const bounds={left:0,top:0,width:200,height:200,right:200,bottom:200};host.getBoundingClientRect=()=>bounds;canvas.getBoundingClientRect=()=>bounds;let held=false;canvas.setPointerCapture=()=>held=true;canvas.hasPointerCapture=()=>held;canvas.releasePointerCapture=()=>held=false;
 const picked=[];let orbits=0;const viewport=Object.create(Viewport.prototype);Object.assign(viewport,{host,renderer:Object.assign(renderer,{domElement:canvas}),camera,nodeMap:new Map(objects.map(o=>[o.id,{mesh:o.object}])),lastSyncedDoc:{nodes:objects.map(o=>({id:o.id,assemblyId:o.assemblyId}))},onPick:()=>picked.push('click'),onBoxSelect:null,boxSelection:false,boxWholeModel:false,escapeSelection:e=>{if(e.key==='Escape')viewport.cancelPointerGesture()},updateOrbitCamera:()=>orbits++,orbitTheta:0,orbitPhi:1,orbitRadius:10});viewport.setupPicking();
 const pointer=(name,x,y,extra={})=>{const e=new dom.window.Event(name,{bubbles:true,cancelable:true});Object.assign(e,{clientX:x,clientY:y,button:0,pointerId:1,isPrimary:true,shiftKey:false,ctrlKey:false,metaKey:false,...extra});canvas.dispatchEvent(e)};
 viewport.setBoxSelection(true,(ids,additive)=>picked.push({ids,additive}));
 test('drag emits a rectangle selection without rotating the camera and removes overlay',()=>{pointer('pointerdown',0,0);pointer('pointermove',100,200);assert.ok(document.querySelector('.viewport-selection-rectangle'));pointer('pointerup',100,200);assert.deepEqual(picked.pop(),{ids:['left'],additive:false});assert.equal(orbits,0);assert.equal(document.querySelector('.viewport-selection-rectangle'),null);});
 test('shift appends and Escape cancels without emitting selection',()=>{pointer('pointerdown',0,0,{shiftKey:true});pointer('pointermove',100,200);pointer('pointerup',100,200);assert.equal(picked.pop().additive,true);const before=picked.length;pointer('pointerdown',0,0);pointer('pointermove',200,200);window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));pointer('pointerup',200,200);assert.equal(picked.length,before);assert.equal(held,false);});
 test('pointer cancel and mode changes discard unfinished gestures',()=>{for(const end of ['pointercancel','mode','through','wholeModel']){const before=picked.length;viewport.setBoxSelection(true,(ids,additive)=>picked.push({ids,additive}));pointer('pointerdown',0,0);pointer('pointermove',100,200);if(end==='mode')viewport.setBoxSelection(false,null);else if(end==='through')viewport.setBoxSelection(true,()=>{},false,true);else if(end==='wholeModel')viewport.setBoxSelection(true,()=>{},true);else pointer('pointercancel',100,200);pointer('pointerup',100,200);assert.equal(picked.length,before);assert.equal(document.querySelector('.viewport-selection-rectangle'),null);}});
 test('Ctrl and Meta append; failed visible picking preserves existing selection and releases capture',()=>{
  for(const modifier of ['ctrlKey','metaKey']){viewport.setBoxSelection(true,(ids,additive)=>picked.push({ids,additive}));pointer('pointerdown',0,0,{[modifier]:true});pointer('pointerup',100,200);assert.equal(picked.pop().additive,true);}
  const original=viewport.renderer.getContext;viewport.renderer.getContext=()=>({isContextLost:()=>true});const before=picked.length;let error='';viewport.setBoxSelection(true,(ids)=>picked.push(ids),false,false,e=>error=e);pointer('pointerdown',0,0);pointer('pointerup',100,200);assert.equal(picked.length,before);assert.match(error,/选区未改变/);assert.equal(held,false);assert.equal(document.querySelector('.viewport-selection-rectangle'),null);viewport.renderer.getContext=original;
 });
 test('ordinary camera drag no longer accidentally selects on release',()=>{viewport.setBoxSelection(false,null);const before=picked.length;pointer('pointerdown',20,20);pointer('pointermove',50,50);pointer('pointerup',50,50);assert.equal(picked.length,before);assert.equal(orbits,1);});
 window.removeEventListener('keydown',viewport.escapeSelection);for(const item of objects){item.object.geometry.dispose();item.object.material.dispose();}
 console.log(count+' rectangle selection checks passed (CPU geometry + mocked ID/depth renderer; no real GPU claim)');
}finally{await server.close();dom.window.close()}
