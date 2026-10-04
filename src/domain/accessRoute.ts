import {Quaternion,Vector3} from 'three';
import type {SceneDocument,Vec3} from './types';
import {inspectClearance} from './clearance';
/** Continuous declared centerline, checked in each segment's frame. Not a path planner. */
export function inspectAccessRoute(doc:SceneDocument,points:Vec3[],width:number,height:number,excludedGroupIds:string[]=[]){
 if(!Array.isArray(points)||points.length<2||points.length>17||points.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x)||Math.abs(x)>10000)))throw Error('通路需要2–17个有限坐标路径点');
 if(!Number.isFinite(width)||width<.1||width>20||!Number.isFinite(height)||height<.1||height>20)throw Error('通路宽高需要0.1–20米');
 if(points.some(p=>Math.abs(p[1]-points[0][1])>.001))throw Error('仅支持同一标高的水平通路；楼梯坡道需独立检查');
 const segments=points.slice(1).map((end,i)=>{
  const start=points[i],delta=new Vector3(...end).sub(new Vector3(...start)),length=delta.length();if(length<.01)throw Error('相邻通路点过近');
  const center=new Vector3(...start).add(new Vector3(...end)).multiplyScalar(.5),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.atan2(delta.x,delta.z));
  const transformed:SceneDocument={...doc,nodes:doc.nodes.map(n=>({...n,transform:{...n.transform,position:new Vector3(...n.transform.position).sub(center).applyQuaternion(q).toArray() as Vec3,rotationQuaternion:q.clone().multiply(new Quaternion(...n.transform.rotationQuaternion)).toArray() as [number,number,number,number]}}))};
  const result=inspectClearance(transformed,[-width/2,.005,-length/2],[width/2,height,length/2],excludedGroupIds);
  return {index:i,start,end,length,candidateCount:result.totalHits,hits:result.hits,truncated:result.truncated};
 });
 return {revision:doc.revision,width,height,segments,length:segments.reduce((n,s)=>n+s.length,0),candidateNodeIds:[...new Set(segments.flatMap(s=>s.hits.map(h=>h.id)))],accepted:false,limitations:'仅检查显式连续中心线各直段净空候选；不自动规划道路，不验证急弯扫掠半径、车辆转弯、坡道、地面承载或安全规范。包围盒候选需实际几何复查。'};
}
