// Developer-only geometry/render fixture, never imported by the app or offered to the model.
import fs from 'node:fs/promises';import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
const {parseModelResponse}=await server.ssrLoadModule('/src/ai/provider.ts');const {applyBatch}=await server.ssrLoadModule('/src/domain/commands.ts');const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');const {exportGlb}=await server.ssrLoadModule('/src/scene/export.ts');
const parts=[];const p=(name,type,params,pos,mat='mat_paint',other={})=>parts.push({name,geometry:{type,params},transform:{position:pos,...other},materialId:mat});
const box=(name,size,pos,mat)=>p(name,'box',{width:size[0],height:size[1],depth:size[2]},pos,mat);
box('底座',[2.1,.3,1.3],[0,.2,0],'mat_dark');
p('斜面底盘','trapezoid',{widthTop:1.9,widthBottom:2.1,height:.25,depth:1.2},[0,.475,0],'mat_paint');
box('左侧机柱',[.3,1.6,1.2],[-.9,1.4,0],'mat_paint');box('右侧机柱',[.35,1.6,1.2],[.875,1.4,0],'mat_blue');box('后壳',[1.8,1.6,.08],[0,1.4,-.55],'mat_paint');box('顶罩',[2.1,.12,1.3],[0,2.24,0],'mat_paint');
p('观察窗框','frame',{width:1.45,height:1.35,depth:.065,thickness:.075},[-.12,1.47,.59],'mat_brushed');box('观察玻璃',[1.28,1.18,.018],[-.12,1.47,.585],'mat_glass');
box('内部工作台',[1.1,.1,.75],[-.1,.8,0],'mat_brushed');for(let i=0;i<5;i++)box('台面槽',[1.0,.008,.017],[-.1,.855,-.27+i*.13],'mat_dark');
box('滑台',[.28,.85,.2],[-.1,1.57,-.33],'mat_dark');box('主轴箱',[.38,.38,.4],[-.1,1.57,-.1],'mat_blue');p('主轴套','tube',{outerRadius:.075,innerRadius:.03,height:.22},[-.1,1.28,.04],'mat_brushed');
box('操作台',[.24,.48,.12],[.87,1.45,.67],'mat_dark');box('屏幕',[.18,.21,.012],[.87,1.55,.739],'mat_screen');for(let i=0;i<3;i++)p('按钮','cylinder',{radiusTop:.017,radiusBottom:.017,height:.014,radialSegments:16},[.81+i*.055,1.34,.742],i===0?'mat_red':'mat_black',{rotationDegrees:[90,0,0]});
p('门把手','capsule',{radius:.015,length:.27},[.42,1.43,.66],'mat_dark');
for(let x of [-.84,.84])for(let z of [-.47,.47])p('调平脚','cylinder',{radiusTop:.065,radiusBottom:.065,height:.08,radialSegments:24},[x,.04,z],'mat_rubber');
// Human silhouette: same free primitives, independently positioned and scaled.
p('人员躯干','trapezoid',{widthTop:.4,widthBottom:.29,height:.48,depth:.22},[1.65,1.15,.85],'mat_fabric');
p('人员头部','sphere',{radius:.115,widthSegments:24,heightSegments:16},[1.65,1.56,.85],'mat_skin',{scale:[.85,1.12,.95]});
p('安全帽','sphere',{radius:.125,widthSegments:24,heightSegments:16},[1.65,1.63,.85],'mat_yellow',{scale:[1,.56,1.05]});
for(let x of [1.55,1.75]){p('腿','capsule',{radius:.065,length:.61},[x,.47,.85],'mat_dark');box('鞋',[.13,.09,.23],[x,.05,.91],'mat_rubber');}
p('右上臂','capsule',{radius:.055,length:.24},[1.91,1.18,.85],'mat_fabric',{rotationDegrees:[0,0,20]});p('右前臂','capsule',{radius:.045,length:.22},[1.98,.95,.96],'mat_fabric',{rotationDegrees:[45,0,0]});p('左上臂','capsule',{radius:.055,length:.24},[1.38,1.2,.85],'mat_fabric',{rotationDegrees:[0,0,-35]});p('左前臂','capsule',{radius:.045,length:.22},[1.2,1.25,.85],'mat_fabric',{rotationDegrees:[0,0,-80]});p('手','sphere',{radius:.05,widthSegments:16,heightSegments:12},[1.06,1.26,.85],'mat_skin');
box('地台',[4.3,.05,3.3],[.4,-.065,.25],'mat_floor');
const batch=parseModelResponse(JSON.stringify({summary:'Developer visual capability fixture',operations:[{op:'createAssembly',name:'形体与材质检查',parts}]}));const r=applyBatch(createInitialDoc(),batch);if(r.errors.length)throw r.errors[0];
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.()})}};const glb=await exportGlb(r.doc);await fs.writeFile('/workspace/shared/chat3d-v14-geometry-check.glb',new Uint8Array(glb));console.log(JSON.stringify({nodes:r.doc.nodes.length,bytes:glb.byteLength}));
}finally{await server.close()}
