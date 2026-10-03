import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
try{
 const {checkRequirements,mergeRequirements}=await server.ssrLoadModule('/src/domain/requirements.ts');
 const {runDiagnostics}=await server.ssrLoadModule('/src/domain/runDiagnostics.ts');
 const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');const {applyBatch}=await server.ssrLoadModule('/src/domain/commands.ts');
 const ops=Array.from({length:4},(_,i)=>({op:'createAssembly',name:'货架'+(i+1),parts:[{name:'主体',geometry:{type:'box',params:{width:2,height:8,depth:1}},transform:{position:[i*3,4,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]}}]}));
 const doc=applyBatch(createInitialDoc(),{operations:ops}).doc;
 await test('requirements use whole assemblies and actual dimensions, not primitive counts',()=>{const r=checkRequirements(doc,[{quote:'四个货架',target:'货架',kind:'count',expected:'4'},{quote:'货架八米高',target:'货架',kind:'height',expected:'8'}]);assert.deepEqual(r.items.map(x=>x.status),['pass','pass']);});
 await test('wrong count and height are mismatches and missing names remain unknown',()=>{const r=checkRequirements(doc,[{quote:'六个货架',target:'货架',kind:'count',expected:'6'},{quote:'货架九米高',target:'货架',kind:'height',expected:'9'},{quote:'四个料箱',target:'料箱',kind:'count',expected:'4'}]);assert.deepEqual(r.items.map(x=>x.status),['mismatch','mismatch','unknown']);});
 await test('color and layout do not fabricate visual acceptance',()=>{const r=checkRequirements(doc,[{quote:'货架蓝色',target:'货架',kind:'color',expected:'蓝色'},{quote:'货架排成两列',target:'货架',kind:'other',expected:'两列'}]);assert.ok(r.items.every(x=>x.status==='unknown'));});
 await test('only user-sourced requirements are accepted and newer values replace the same target kind',()=>{const a={quote:'四个货架',target:'货架',kind:'count',expected:'4'};const b={...a,quote:'六个货架',expected:'6'};assert.equal(mergeRequirements([a],[b],['四个货架','六个货架']).length,1);assert.equal(mergeRequirements([a],[b],['四个货架','六个货架'])[0].expected,'6');assert.throws(()=>mergeRequirements([],[a],['一个桌子']),/用户实际指令/);});
 await test('expected values must agree with quoted quantities and convert centimetres to metres',()=>{const a={quote:'四个货架',target:'货架',kind:'count',expected:'1'};assert.throws(()=>mergeRequirements([],[a],['四个货架']),/期望数值/);const b={quote:'货架高800厘米',target:'货架',kind:'height',expected:'8'};assert.equal(mergeRequirements([],[b],[b.quote])[0].expected,'8');});
 await test('diagnostics allowlist cannot leak credentials, scene text, URLs or raw tool errors',()=>{const secret='secret-value';const a={turn:2,toolCalls:1,inputTokens:10,outputTokens:20,title:secret,events:[secret],timings:[{kind:'tool',label:secret,detail:secret,startedAt:1,endedAt:2,failed:true}]};const json=JSON.stringify(runDiagnostics('error',a,'HTTP 401 '+secret+' https://private.example'));assert.ok(!json.includes(secret));assert.ok(!json.includes('private.example'));assert.match(json,/401/);});
 await test('dimension evidence binds width height and depth, never a different number from the same quote',()=>{
 for(const quote of ['货架宽2米高3米深1米','货架宽2米、高3米、深1米','货架宽200厘米，高300厘米，深100厘米','货架2米宽、3米高、1米深']){
  const req={quote,target:'货架',kind:'height',expected:'2'};assert.throws(()=>mergeRequirements([],[req],[quote]),/期望数值/);
  for(const [kind,expected] of [['height','3'],['width','2'],['depth','1']])assert.equal(mergeRequirements([],[{...req,kind,expected}],[quote])[0].expected,expected);
  const correct=mergeRequirements([],[{...req,expected:'3'}],[quote]);const wrong=structuredClone(doc);for(const node of wrong.nodes)node.geometry.params.height=2;assert.equal(checkRequirements(wrong,correct).items[0].status,'mismatch');
 }
 const quote='货架尺寸2米和3米';assert.throws(()=>mergeRequirements([],[{quote,target:'货架',kind:'height',expected:'2'}],[quote]),/期望数值/);
});
 await test('natural length width total height map to geometry X Z Y and never borrow each other numbers',()=>{
 const quote='创建工作台，长1.2米、宽0.8米、总高0.75米';
 const table=applyBatch(createInitialDoc(),{operations:[{op:'createAssembly',name:'工作台',parts:[{name:'台面',geometry:{type:'box',params:{width:1.2,depth:.8,height:.05}},transform:{position:[0,.725,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]}},...[-.55,.55].flatMap(x=>[-.35,.35].map(z=>({name:'金属腿',geometry:{type:'box',params:{width:.05,depth:.05,height:.7}},transform:{position:[x,.35,z],scale:[1,1,1],rotationQuaternion:[0,0,0,1]}})))]}]}).doc;
 const req=mergeRequirements([],['length','width','height'].map((kind,i)=>({quote,target:'工作台',kind,expected:['1.2','.8','.75'][i]})),[quote]);
 assert.deepEqual(checkRequirements(table,req).items.map(r=>r.status),['pass','pass','pass']);assert.deepEqual(checkRequirements(table,req).items.map(r=>r.actual.match(/包围盒 ([XYZ])/)[1]),['X','Z','Y']);
 for(const [kind,expected] of [['length','.8'],['width','1.2'],['height','1.2'],['depth','.8']])assert.throws(()=>mergeRequirements([],[{quote,target:'工作台',kind,expected}],[quote]),/期望数值/);
 const swapped=structuredClone(table);swapped.nodes[0].geometry.params.width=.8;swapped.nodes[0].geometry.params.depth=1.2;assert.deepEqual(checkRequirements(swapped,req).items.map(r=>r.status),['mismatch','mismatch','pass']);
 const part=checkRequirements(table,[{quote:'台面灰色',target:'台面',kind:'color',expected:'灰色'}]).items[0];assert.equal(part.status,'unknown');assert.match(part.actual,/匹配零件的材质色/);assert.doesNotMatch(part.actual,/没有找到/);
 const count=mergeRequirements([],[{quote:'四条金属腿',target:'金属腿',kind:'count',expected:'4'}],['四条金属腿']);assert.equal(checkRequirements(table,count).items[0].status,'pass');
});
await test('Chinese length units and narrowed width quote keep natural dimension convention',()=>{
 const text='工作台长度一百二十厘米、宽八十厘米、总高七十五厘米';
 const req=mergeRequirements([],[{quote:'长度一百二十厘米',target:'工作台',kind:'length',expected:'1.2'},{quote:'宽八十厘米',target:'工作台',kind:'width',expected:'.8'},{quote:'总高七十五厘米',target:'工作台',kind:'height',expected:'.75'}],[text]);assert.ok(req.every(r=>r.dimensionBasis==='length-width'));
 const d=applyBatch(createInitialDoc(),{operations:[{op:'createPrimitive',name:'工作台',transform:{position:[0,0,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]},geometry:{type:'box',params:{width:1.2,depth:.8,height:.75}}}]}).doc;assert.ok(checkRequirements(d,req).items.every(r=>r.status==='pass'));
});
await test('explicit conflicting axes and mixed length depth are unknown, never silently accepted',()=>{
 const d=applyBatch(createInitialDoc(),{operations:[{op:'createPrimitive',name:'工作台',transform:{position:[0,0,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]},geometry:{type:'box',params:{width:1.2,depth:.8,height:.75}}}]}).doc;
 for(const quote of ['工作台长1.2米、宽0.8米，长度沿Z轴','工作台长1.2米、宽0.8米、深0.8米','工作台旋转90度后长度1.2米']){
  const req=mergeRequirements([],[{quote,target:'工作台',kind:'length',expected:'1.2'}],[quote]);assert.equal(checkRequirements(d,req).items[0].status,'unknown');
 }
 const quote='工作台尺寸1.2×0.8×0.75米';assert.throws(()=>mergeRequirements([],[{quote,target:'工作台',kind:'length',expected:'1.2'}],[quote]),/期望数值/);
});
 await test('latest explicit width depth convention does not inherit stale natural length axes',()=>{
 const prior={quote:'工作台长1.2米',target:'工作台',kind:'length',expected:'1.2'};const quote='工作台宽0.8米深1.2米高0.75米';const req=mergeRequirements([prior],[{quote,target:'工作台',kind:'width',expected:'.8'}],[prior.quote,quote]);const d=applyBatch(createInitialDoc(),{operations:[{op:'createPrimitive',name:'工作台',geometry:{type:'box',params:{width:.8,depth:1.2,height:.75}},transform:{position:[0,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]}}]}).doc;assert.equal(checkRequirements(d,req).items.find(r=>r.kind==='width').status,'pass');const axisQuote='工作台高0.75米，高度沿Z轴';const height=mergeRequirements([],[{quote:axisQuote,target:'工作台',kind:'height',expected:'.75'}],[axisQuote]);assert.equal(checkRequirements(d,height).items[0].status,'unknown');
 });
 await test('accessory names never become false count mismatches or incentives to rename the model',()=>{const nodes=['货架','货架配套物料'].map((name,i)=>({id:'node-'+i,parentId:null,kind:'primitive',name,visible:true,geometry:{type:'box',params:{width:1,height:1,depth:1}},transform:{position:[i*2,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]}}));const d={schemaVersion:1,projectId:'test',revision:1,unit:'m',upAxis:'Y',nodes,materials:[],assets:[]};const result=checkRequirements(d,[{quote:'一组货架',target:'货架',kind:'count',expected:'1'}]);assert.equal(result.items[0].status,'unknown');assert.match(result.items[0].actual,/不要.*改名/);const station={...d,nodes:[{...nodes[0],name:'立加工位'}]};assert.equal(checkRequirements(station,[{quote:'一个立加',target:'立加',kind:'count',expected:'1'}]).items[0].status,'pass');const numbered={...d,nodes:nodes.map((n,i)=>({...n,name:'货架'+(i+1)}))};assert.equal(checkRequirements(numbered,[{quote:'两组货架',target:'货架',kind:'count',expected:'2'}]).items[0].status,'pass');});
 console.log(`${passed} requirement and diagnostic checks passed`);
}finally{await server.close()}
