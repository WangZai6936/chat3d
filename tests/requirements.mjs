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
 console.log(`${passed} requirement and diagnostic checks passed`);
}finally{await server.close()}
