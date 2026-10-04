import {Box3,Vector3} from 'three';
import type {SceneRole} from './types';
export interface SpatialPart {id:string;name:string;bounds:Box3}
export interface SpatialGroup {id:string;name:string;role?:SceneRole;bounds:Box3;parts:SpatialPart[]}
/** Conservative occupancy candidates, not a triangle collision or physics solver.
 * A hollow container's reserved interior still matters for people/other assemblies.
 * Same-assembly joins and environment envelopes are intentionally excluded.
 */
export function inspectSpatialOccupancy(groups:SpatialGroup[]){
 const eligible=groups.filter(g=>g.role!=='floor'&&g.role!=='building');
 const ordered=[...eligible].sort((a,b)=>Number(b.role==='person')-Number(a.role==='person')).slice(0,200);
 const candidates:{a:string;b:string;aName:string;bName:string;kind:'body_occupancy'|'bounds_overlap';overlap:number[];partPairs:{a:string;b:string;aName:string;bName:string}[];partChecksComplete:boolean;relation:'body_or_reserved_space'|'enclosing_space'|'contact_or_overlap'}[]=[];
 let pairsChecked=0,totalCandidates=0,remainingPartChecks=40000;
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
  const a=ordered[i],b=ordered[j];pairsChecked++;
  const overlap=a.bounds.clone().intersect(b.bounds),size=overlap.getSize(new Vector3());
  if(overlap.isEmpty()||Math.min(size.x,size.y,size.z)<=.015)continue;
  const person=a.role==='person'?a:b.role==='person'?b:undefined,other=person===a?b:a;
  // Use actual torso/pelvis bounds when labelled, otherwise central body envelope.
  // Hands/feet touching an operation surface alone should not be body occupancy.
  const body=person?.parts.filter(p=>/torso|pelvis|chest|躯干|胸部|身体|骨盆|腰/i.test(p.name));
  const fallback=person?.bounds.clone();if(fallback){const s=fallback.getSize(new Vector3());fallback.min.add(new Vector3(s.x*.3,s.y*.25,s.z*.3));fallback.max.sub(new Vector3(s.x*.3,s.y*.25,s.z*.3));}
  const bodyOccupied=!!person&&(body?.length?body.map(p=>p.bounds):[fallback!]).some(box=>{
   const v=box.clone().intersect(other.bounds).getSize(new Vector3());return Math.min(v.x,v.y,v.z)>.03;
  });
  totalCandidates++;if(candidates.length>=24)continue;
  const partPairs:{a:string;b:string;aName:string;bName:string}[]=[];let complete=true;
  outer:for(const p of a.parts)for(const q of b.parts){
   if(remainingPartChecks--<=0){complete=false;break outer;}
   const s=p.bounds.clone().intersect(q.bounds).getSize(new Vector3());
   if(Math.min(s.x,s.y,s.z)>.005){partPairs.push({a:p.id,b:q.id,aName:p.name,bName:q.name});if(partPairs.length>=4){complete=false;break outer;}}
  }
  candidates.push({a:a.id,b:b.id,aName:a.name,bName:b.name,kind:bodyOccupied?'body_occupancy':'bounds_overlap',overlap:size.toArray().map(v=>Math.round(v*10000)/10000),partPairs,partChecksComplete:complete,relation:other.role==='safety'&&!partPairs.length&&complete?'enclosing_space':bodyOccupied?'body_or_reserved_space':'contact_or_overlap'});
 }
 return {method:'world_aabb_occupancy' as const,status:'review_required' as const,groupsChecked:ordered.length,totalGroups:eligible.length,pairsChecked,totalCandidates,truncated:eligible.length>200||totalCandidates>candidates.length,candidates,
  limitations:'包围盒仅筛查占位风险，空腔、座椅、承托及有意接触需人工或真实多视角复核；没有候选也不代表无碰撞。地坪与建筑整体外壳不参与本检查；未标记的人员只作普通对象检查。'};
}
