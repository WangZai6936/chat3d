import {Box3,Matrix4,Quaternion,Vector3} from 'three';import {boundsFor} from './sceneQuality';import type {SceneDocument,Vec3} from './types';
/** A user/model-declared world volume, no guessed anthropometric or safety standard. */
export function inspectClearance(doc:SceneDocument,min:Vec3,max:Vec3,excludedGroupIds:string[]=[]){
 if([...min,...max].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||min.some((v,i)=>v>=max[i]))throw Error('净空范围需为有限且min严格小于max的米制坐标');
 const allGroups=new Set(doc.nodes.map(n=>n.assemblyId??n.id));if(excludedGroupIds.length>16||excludedGroupIds.some(id=>!allGroups.has(id)))throw Error('排除对象须为真实组件，最多16个');
 const region=new Box3(new Vector3(...min),new Vector3(...max)),excluded=new Set(excludedGroupIds),hits:{id:string;groupId:string;name:string}[]=[];let totalHits=0;
 for(const n of doc.nodes){if(!n.visible||!n.geometry||n.sceneRole==='floor'||excluded.has(n.assemblyId??n.id))continue;
  const t=n.transform,b=boundsFor(n.geometry).applyMatrix4(new Matrix4().compose(new Vector3(...t.position),new Quaternion(...t.rotationQuaternion),new Vector3(...t.scale)));const v=b.intersect(region).getSize(new Vector3());if(Math.min(v.x,v.y,v.z)>.005){totalHits++;if(hits.length<32)hits.push({id:n.id,groupId:n.assemblyId??n.id,name:n.name});}
 }
 return {revision:doc.revision,min,max,excludedGroupIds,hits,totalHits,truncated:totalHits>hits.length,status:totalHits?'obstruction_candidates':'no_aabb_candidate',accepted:false,note:'仅核对指定净空体积与可见零件包围盒，排除地坪和显式对象。不证明道路连通、实际无碰撞或符合安全规范。'};
}
