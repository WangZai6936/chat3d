import type {SceneDocument} from './types';
/** Deterministic shape clues, not a semantic verdict or collision/visual acceptance. */
export function inspectGeometryQuality(doc:SceneDocument):string[]{
 const issues:string[]=[];
 for(const n of doc.nodes){
  if(!n.visible)continue;
  const g=n.geometry;
  if(g?.type==='lathe'&&g.params.wallThickness===undefined){
   const p=g.params.points,openStart=p[0][0]>1e-8&&!g.params.capStart,openEnd=p[p.length-1][0]>1e-8&&!g.params.capEnd;
   if(openStart||openEnd)issues.push(`${n.name}：旋转曲面${openStart?'起端':''}${openStart&&openEnd?'和':''}${openEnd?'末端':''}未封口；实心底座请设置对应capStart/capEnd，薄壳请用wallThickness。若为设计开口可保留，不能据此断言缺陷。`);
  }
 }
 // Exact duplicate surfaces are a general warning, independent of names/categories.
 const signatures=new Map<string,string>();
 for(const n of doc.nodes.filter(n=>n.visible).slice(0,1000)){
  if(n.geometry?.type==='mesh')continue; // Do not stringify large imported meshes.
  const key=JSON.stringify([n.parentId,n.geometry,n.transform]);const previous=signatures.get(key);
  if(previous)issues.push(`${previous} / ${n.name}：几何和变换完全相同，可能有重复表面；核对后移除重复体，保留有意叠加。`);else signatures.set(key,n.name);
 }
 const groups=new Map<string,typeof doc.nodes>();for(const n of doc.nodes)if(n.visible&&n.geometry?.type==='tube'&&n.assemblyId){const a=groups.get(n.assemblyId)??[];a.push(n);groups.set(n.assemblyId,a);}
 // Flag only named shells, not arbitrary washers/bearings/stacked storage.
 for(const nodes of groups.values()){
  const shell=nodes.filter(n=>/灯罩|锥罩|漏斗|shade|funnel|shell/i.test(n.name));
  if(shell.length>=3){const radii=new Set(shell.map(n=>n.geometry?.type==='tube'?n.geometry.params.outerRadius:0));if(radii.size>=3)issues.push(`${shell[0].assemblyName??'组件'}：多个不同半径管环用于壳体，可能出现阶梯拼接；连续收分外形优先单个lathe+wallThickness。设计本就阶梯状时请保留并说明。`);}
 }
 // Axis-aligned boxes with interior overlap and a shared outer face can z-fight.
 // Bounded check, warning only: intersecting support members may be intentional.
 const boxes=doc.nodes.filter(n=>n.visible&&n.assemblyId&&n.geometry?.type==='box'&&n.transform.rotationQuaternion.slice(0,3).every(x=>Math.abs(x)<1e-8)).slice(0,256);
 let pairs=0;
 for(let i=0;i<boxes.length&&pairs<6;i++)for(let j=i+1;j<boxes.length&&pairs<6;j++){
  const a=boxes[i],b=boxes[j];if(a.assemblyId!==b.assemblyId||a.geometry?.type!=='box'||b.geometry?.type!=='box')continue;
  const box=(n:typeof a)=>{const p=(n.geometry as {type:'box';params:{width:number;height:number;depth:number}}).params,size=[p.width,p.height,p.depth];return size.map((v,k)=>[n.transform.position[k]-v*Math.abs(n.transform.scale[k])/2,n.transform.position[k]+v*Math.abs(n.transform.scale[k])/2]);};
  const aa=box(a),bb=box(b),overlap=aa.map((v,k)=>Math.min(v[1],bb[k][1])-Math.max(v[0],bb[k][0]));
  if(overlap.every(x=>x>1e-5)&&aa.some((v,k)=>Math.abs(v[0]-bb[k][0])<1e-6||Math.abs(v[1]-bb[k][1])<1e-6)){
   pairs++;issues.push(`${a.name} / ${b.name}：实体范围交叠且有重合外表面，可能出现闪烁或黑缝；近景核对后合并连续形体或消除共面重叠，不要盲目移动功能接口。`);
  }
 }
 return issues.slice(0,12);
}
