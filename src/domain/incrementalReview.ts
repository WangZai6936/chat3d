import {assemblyBounds} from './assemblyEditing';
import type {SceneDocument} from './types';
import {validateDetailReview,type DetailReview,type DetailCriterion} from './detailAcceptance';
const intrinsic:DetailCriterion[]=['silhouette','structure','materials','details'];
/** Conservative evidence reuse: only byte-identical subject geometry/placement/materials.
 * Global context always invalidates on scene changes. Registered contact evidence
 * can survive only when its endpoints and conservative neighbourhood are unchanged.
 * This preserves prior evidence explicitly; it never pretends a new image was taken.
 */
/** Only registered local contacts may survive an unrelated remote edit.
 * We include incoming/outgoing endpoints and their nearby occupiers. Unknown
 * bounds or parent transforms deliberately fall back to invalidation. Global
 * context is never inferred from this local neighbourhood.
 */
function contactDependencies(doc:SceneDocument):(componentId:string)=>string|null {
 const groups=new Map<string,SceneDocument['nodes']>();
 for(const n of doc.nodes){const key=n.assemblyId??n.id,list=groups.get(key)??[];list.push(n);groups.set(key,list);}
 if(groups.size>500||doc.nodes.some(n=>n.parentId!==null||(!n.geometry&&n.visible)))return ()=>null;
 const owner=new Map(doc.nodes.map(n=>[n.id,n.assemblyId??n.id]));
 const bounds=new Map([...groups].map(([id,nodes])=>[id,assemblyBounds(nodes.filter(n=>n.visible))]));
 const materials=new Map(doc.materials.map(m=>[m.id,m]));
 return componentId=>{
 const relations=doc.nodes.filter(n=>n.connection&&(owner.get(n.id)===componentId||owner.get(n.connection.targetId)===componentId));
 if(!relations.length)return null;
 const dependencies=new Set([componentId]);
 for(const n of relations){const target=owner.get(n.connection!.targetId);if(!target)return null;dependencies.add(owner.get(n.id)!);dependencies.add(target);}
 const neighbourhood=[...dependencies].map(id=>bounds.get(id)!.clone().expandByScalar(.5));
 if(neighbourhood.some(b=>b.isEmpty()||![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite)))return null;
 for(const [id,b] of bounds)if(neighbourhood.some(area=>area.intersectsBox(b)))dependencies.add(id);
 return JSON.stringify([...dependencies].sort().map(id=>[id,groups.get(id)!.map(n=>[n,materials.get(n.materialId??'')]).sort((a,b)=>String((a[0] as {id:string}).id).localeCompare(String((b[0] as {id:string}).id)))]));
 };
}
export function carryUnchangedReviews(before:SceneDocument,after:SceneDocument,reviews:DetailReview[]):DetailReview[]{
 if(JSON.stringify(before.assets)!==JSON.stringify(after.assets)||JSON.stringify(before.animation)!==JSON.stringify(after.animation))return [];
 const stamps=(d:SceneDocument)=>{
  const materials=new Map(d.materials.map(m=>[m.id,JSON.stringify(m)])),groups=new Map<string,string[]>();
  for(const n of d.nodes){const id=n.assemblyId??n.id,list=groups.get(id)??[];const {connection,...subject}=n;list.push(JSON.stringify(subject)+'|'+(materials.get(n.materialId??'')??''));groups.set(id,list);}
  return new Map([...groups].map(([id,parts])=>[id,parts.sort().join('\n')]));
 };
 const old=stamps(before),next=stamps(after);
 const worldSame=old.size===next.size&&[...old].every(([id,stamp])=>next.get(id)===stamp)&&JSON.stringify(before.nodes.map(n=>[n.id,n.connection]))===JSON.stringify(after.nodes.map(n=>[n.id,n.connection]));
 const out:DetailReview[]=[];
 let beforeContacts:ReturnType<typeof contactDependencies>|undefined,afterContacts:ReturnType<typeof contactDependencies>|undefined;
 for(const r of reviews){
  if(r.revision!==before.revision||validateDetailReview(before,r).length||!old.has(r.componentId)||old.get(r.componentId)!==next.get(r.componentId))continue;
  const retained:DetailCriterion[]=worldSame?r.checks.map(c=>c.criterion):[...intrinsic];
  if(!worldSame){beforeContacts??=contactDependencies(before);afterContacts??=contactDependencies(after);const previous=beforeContacts(r.componentId);if(previous!==null&&previous===afterContacts(r.componentId))retained.push('connections');}
  const checks=r.checks.map(c=>retained.includes(c.criterion)?{...c,nodeIds:[...c.nodeIds]}:{...c,status:'unknown' as const,evidence:'场景几何或关系已变化，此连接/环境结论需重新检查。',nodeIds:[]});
  const criterionEvidence=Object.fromEntries(checks.map(c=>[c.criterion,retained.includes(c.criterion)?(r.criterionEvidence?.[c.criterion]??(r.reusedCriteria?.includes(c.criterion)?r.evidenceRevision:undefined)??r.revision):after.revision])) as Record<DetailCriterion,number>;
  const carried:DetailReview={...r,revision:after.revision,evidenceRevision:Math.min(...retained.map(k=>criterionEvidence[k])),criterionEvidence,reusedCriteria:retained,visualEvidence:false,interactionEvidence:false,checks};
  if(!validateDetailReview(after,carried).length)out.push(carried);
 }
 return out;
}
