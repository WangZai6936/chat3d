// Deterministic regression fixtures, not a claim about live model generation quality.
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'vite';
const output=path.resolve(process.argv[2]??'/tmp/chat3d-quality-fixtures');fs.mkdirSync(output,{recursive:true});
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.()})}};
try{
const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');const {loadMeshComponent}=await server.ssrLoadModule('/src/scene/meshCatalog.ts');const {applyBatch}=await server.ssrLoadModule('/src/domain/commands.ts');const {exportGlb}=await server.ssrLoadModule('/src/scene/export.ts');const {detailTargets}=await server.ssrLoadModule('/src/domain/detailAcceptance.ts');const {validateDocument}=await server.ssrLoadModule('/src/domain/types.ts');
const base=createInitialDoc();const fixtures=[];
for(const [key,name] of [['vmc','立式加工中心'],['production-worker','生产人员']]){const data=await loadMeshComponent({key,name,position:[0,0,0]},undefined,async u=>new Response(fs.readFileSync('public'+u)));fixtures.push([key,{...base,...data}])}
const materials=[{id:'brass',baseColor:'#b48a48',roughness:.3,metalness:.8},{id:'shade',baseColor:'#21423b',roughness:.42,metalness:.1,doubleSided:true},{id:'lining',baseColor:'#eadfc8',roughness:.65,metalness:0,doubleSided:true},{id:'rubber',baseColor:'#242828',roughness:.88,metalness:0},{id:'bulb',baseColor:'#fff4ce',roughness:.2,metalness:0,emissive:'#ffe6ab',emissiveIntensity:.5}];
const transform=position=>({position,rotationQuaternion:[0,0,0,1],scale:[1,1,1]});const parts=[];
const add=(name,geometry,position,materialId)=>parts.push({name,geometry,transform:transform(position),materialId});
add('底座曲面',{type:'lathe',params:{points:[[0,0],[.15,.002],[.175,.01],[.18,.025],[.17,.045],[.12,.055],[0,.056]],segments:64}},[0,0,0],'brass');
add('防滑底垫',{type:'cylinder',params:{radiusTop:.16,radiusBottom:.16,height:.008}},[0,.004,0],'rubber');
add('弯曲支撑臂',{type:'sweepTube',params:{points:[[0,.04,0],[0,.25,0],[.015,.48,0],[.08,.60,0],[.21,.64,0],[.28,.61,0]],radius:.014,segments:64,radialSegments:24}},[0,0,0],'brass');
add('灯头球形关节',{type:'sphere',params:{radius:.029}},[.28,.61,0],'brass');
add('灯罩外壁',{type:'lathe',params:{points:[[.165,0],[.165,.012],[.155,.027],[.12,.07],[.082,.12],[.047,.15],[.026,.157]],segments:64}},[.28,.43,0],'shade');
add('灯罩内衬',{type:'lathe',params:{points:[[.157,.001],[.157,.012],[.147,.027],[.112,.07],[.074,.12],[.039,.15],[.024,.151]],segments:64}},[.28,.43,0],'lining');
add('灯罩包边',{type:'tube',params:{outerRadius:.167,innerRadius:.155,height:.009}},[.28,.434,0],'brass');
add('灯座',{type:'cylinder',params:{radiusTop:.025,radiusBottom:.025,height:.065}},[.28,.548,0],'rubber');
add('灯泡',{type:'sphere',params:{radius:.037}},[.28,.495,0],'bulb');
add('旋钮',{type:'cylinder',params:{radiusTop:.021,radiusBottom:.021,height:.017}},[-.06,.062,.07],'brass');
add('电源线',{type:'sweepTube',params:{points:[[-.10,.025,-.075],[-.19,.01,-.13],[-.29,.007,-.15],[-.34,.007,-.25]],radius:.003,segments:40,radialSegments:12}},[0,0,0],'rubber');
const r=applyBatch({...base,materials:[...base.materials,...materials]},{operations:[{op:'createAssembly',name:'复古台灯',parts}]});if(r.errors.length)throw r.errors[0];fixtures.push(['lamp',r.doc]);
const reports=[];for(const [key,doc] of fixtures){const errors=validateDocument(doc);if(errors.length)throw errors[0];const dir=path.join(output,key);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'input.glb'),Buffer.from(await exportGlb(doc)));fs.writeFileSync(path.join(dir,'document.json'),JSON.stringify(doc));reports.push({key,nodes:doc.nodes.length,detailTargets:detailTargets(base,doc),visualAcceptance:'pending',source:'deterministic fixture, not live model output'})}fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await server.close()}
