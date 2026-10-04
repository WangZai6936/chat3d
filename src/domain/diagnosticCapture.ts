import type {SceneDocument} from './types';
/** A diagnostic view is deliberately incomplete, and never acceptance evidence. */
export function diagnosticCaptureDocument(doc:SceneDocument,targetIds:string[],contextIds:string[]=[]){
 if(!Array.isArray(targetIds)||!targetIds.length||targetIds.length>48||!Array.isArray(contextIds)||contextIds.length>96)throw Error('诊断取景需要1–48个目标，最多96个上下文部件');
 const ids=[...targetIds,...contextIds];if(ids.some(id=>typeof id!=='string'||!doc.nodes.some(n=>n.id===id&&n.visible&&n.geometry)))throw Error('诊断取景必须引用真实可见几何节点');
 const shown=new Set(ids),nodes=doc.nodes.filter(n=>shown.has(n.id));
 return {document:{...doc,nodes},targetIds:[...new Set(targetIds)],hiddenCount:doc.nodes.filter(n=>n.visible&&n.geometry&&!shown.has(n.id)).length,acceptanceEvidence:false as const,limitations:'隔离诊断图隐藏未选对象，仅用于识别形体缺陷；不能证明场景无穿插、操作接触或空间关系合格。修改后必须回到完整场景复查。'};
}

/** Whole component only: intrinsic evidence must not omit inconvenient parts. */
export function intrinsicCaptureDocument(doc:SceneDocument,componentId:string){
 const members=doc.nodes.filter(n=>(n.assemblyId??n.id)===componentId);
 if(!members.length||members.length>2000||!members.some(n=>n.visible&&n.geometry))throw Error('单体取景需要真实可见组件，最多2000个零件');
 return {document:{...doc,nodes:members},targetIds:members.filter(n=>n.visible&&n.geometry).map(n=>n.id),hiddenCount:doc.nodes.filter(n=>n.visible&&n.geometry&&(n.assemblyId??n.id)!==componentId).length,scope:'intrinsic' as const,limitations:'完整单体隔离图仅支持自身外形、结构与用途细节；材质还需真实渲染。连接、外部接触、落地、遮挡与空间关系必须保留完整场景另验，不能据此通过。'};
}
