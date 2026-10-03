import {Matrix4,Quaternion,Triangle,Vector3} from 'three';
import type {SceneDocument,SceneNode,Vec3} from './types';
import {buildPrimitiveGeometry} from '../scene/geometry';
import {worldPoint} from './connections';
/** Exact point-to-triangle distance, not a full mesh collision/penetration solver. */
export function anchorSurfaceDistance(node:SceneNode,point:Vec3,budget:{remaining:number}):number|null {
 if(!node.geometry)return null;
 if(node.geometry.type==='mesh'&&node.geometry.params.indices.length/3>budget.remaining)return null;
 const g=buildPrimitiveGeometry(node.geometry);
 try{
  const p=g.getAttribute('position'),index=g.getIndex(),count=index?index.count:p.count;
  if(count/3>budget.remaining)return null;budget.remaining-=count/3;
  const matrix=new Matrix4().compose(new Vector3(...node.transform.position),new Quaternion(...node.transform.rotationQuaternion),new Vector3(...node.transform.scale));
  const anchor=new Vector3(...worldPoint(node,point)),triangle=new Triangle(),closest=new Vector3();let distance=Infinity;
  for(let i=0;i+2<count;i+=3){
   triangle.a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix);
   triangle.b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(matrix);
   triangle.c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(matrix);
   triangle.closestPointToPoint(anchor,closest);distance=Math.min(distance,anchor.distanceTo(closest));
  }
  return Number.isFinite(distance)?distance:null;
 }finally{g.dispose();}
}
export function inspectContactSurfaces(doc:SceneDocument,sourceIds?:string[],triangleBudget=200000){
 const budget={remaining:triangleBudget},byId=new Map(doc.nodes.map(n=>[n.id,n]));
 return doc.nodes.filter(n=>n.connection&&(!sourceIds||sourceIds.includes(n.id))).map(n=>{
  const c=n.connection!,target=byId.get(c.targetId);const tolerance=Math.min(c.maxDistance,.02);
  const sourceDistance=anchorSurfaceDistance(n,c.sourcePoint,budget),targetDistance=target?anchorSurfaceDistance(target,c.targetPoint,budget):null;
  const status=sourceDistance===null||targetDistance===null?'unknown':Math.max(sourceDistance,targetDistance)>tolerance?'off_surface':'on_surface';
  return {sourceId:n.id,targetId:c.targetId,purpose:c.purpose,status,sourceDistance,targetDistance,tolerance,note:'仅检查登记点是否贴近真实三角面；不证明没有穿模、姿态自然或工艺正确'};
 });
}
