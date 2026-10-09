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
 return {required:hasReference,featureCount:features.length,recordedCount:features.length-missing.length,accepted:false,
  issues:!hasReference?[]:!features.length?['参考图尚未拆解为可逐项核对的可见结构特征']:missing.map(f=>`${f.object}：${f.name}缺少参考图可见特征记录`),
  limitation:'只统计是否记录参考观察，不证明观察正确、几何实现或视觉相似；遮挡部分须注明未知，不能编造精确尺寸。'};
}

export function referenceShapeChanged(before:SceneDocument,after:SceneDocument){
 const previous=new Map(before.nodes.map(n=>[n.id,n.geometry]));
 return before.nodes.length!==after.nodes.length||after.nodes.some(n=>!previous.has(n.id)||JSON.stringify(previous.get(n.id))!==JSON.stringify(n.geometry));
}
