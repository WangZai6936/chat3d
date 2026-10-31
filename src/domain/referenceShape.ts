import type {SceneDocument} from './types';
import type {ObjectBlueprint} from './objectBlueprint';

/** Measures declared planar profile geometry, never estimates fidelity from pixels. */
export function profileOpeningMetrics(doc:SceneDocument){
 const area=(p:[number,number][])=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1]},0))/2;
 const profiles=doc.nodes.filter(n=>n.visible&&n.geometry?.type==='profile');
 return {items:profiles.slice(0,48).map(n=>{
  const g=n.geometry;if(g?.type!=='profile')throw Error('Expected profile');
  const outerArea=area(g.params.points),holeArea=(g.params.holes??[]).reduce((sum,p)=>sum+area(p),0);
  return {nodeId:n.id,name:n.name,holeCount:g.params.holes?.length??0,openingAreaRatio:outerArea>0?holeArea/outerArea:null,depth:g.params.depth,roundedEdges:!!(g.params.cornerRadius||g.params.edgeRadius)};
 }),remaining:Math.max(0,profiles.length-48),limitation:'开孔率仅为各profile原始二维截面孔面积/外轮廓面积，不含倒角、其他部件遮挡或重叠，不等于整件可见通透率或参考图相似度；多块板的比例不能直接相加。'};
}

export function referenceObservationCoverage(plans:ObjectBlueprint[],hasReference:boolean){
 const features=plans.flatMap(p=>p.features.map(f=>({object:p.name,name:f.name,observation:f.referenceObservation??null})));
 const missing=features.filter(f=>!f.observation);
 const issues:string[]=!hasReference?[]:!features.length?['参考图尚未拆解为可逐项核对的可见结构特征']:missing.map(f=>`${f.object}：${f.name}缺少参考图可见特征记录`);
 // Multi-part machines in a reference photo rarely resolve with 1–2 buckets; push for a real inventory.
 if(hasReference&&features.length>0&&features.length<4)issues.push('参考图结构特征过少（当前'+features.length+'项）：复杂设备应按可见分区拆成更多可核对特征（如底盘、门架/立柱、货叉或载货面、灯具/标牌等），避免单柱或单箱偷懒');
 return {required:hasReference,featureCount:features.length,recordedCount:features.length-missing.length,accepted:false,
  issues,
  limitation:'只统计是否记录参考观察及特征拆分是否过粗，不证明观察正确、几何实现或视觉相似；遮挡部分须注明未知，不能编造精确尺寸。'};
}

export function referenceShapeChanged(before:SceneDocument,after:SceneDocument){
 const previous=new Map(before.nodes.map(n=>[n.id,n.geometry]));
 return before.nodes.length!==after.nodes.length||after.nodes.some(n=>!previous.has(n.id)||JSON.stringify(previous.get(n.id))!==JSON.stringify(n.geometry));
}
