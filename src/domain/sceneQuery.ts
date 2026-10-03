import {inspectMeshUV} from './uvQuality';
import {Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument} from './types';
import {boundsFor} from './sceneQuality';
export interface PartQuery {assemblyId?:string;terms?:string[];offset?:number;limit?:number}
export function findSceneParts(doc:SceneDocument,q:PartQuery){
 const limit=q.limit??16,offset=q.offset??0;if(!Number.isInteger(limit)||limit<1||limit>48||!Number.isInteger(offset)||offset<0||offset>10000||q.terms&&(!Array.isArray(q.terms)||q.terms.length>12||q.terms.some(s=>typeof s!=='string'||s.length>80)))throw Error('查询范围无效');
 if(q.assemblyId&&!doc.nodes.some(n=>(n.assemblyId??n.id)===q.assemblyId))throw Error('组件不存在');
 const terms=(q.terms??[]).map(s=>s.toLowerCase());const all=doc.nodes.filter(n=>(!q.assemblyId||(n.assemblyId??n.id)===q.assemblyId)&&(!terms.length||terms.some(s=>(n.name+' '+(n.label??'')).toLowerCase().includes(s))));
 const round=(x:number)=>Math.round(x*10000)/10000;
 return {revision:doc.revision,total:all.length,offset,nextOffset:offset+limit<all.length?offset+limit:null,parts:all.slice(offset,offset+limit).map(n=>{const m=new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));const b=n.geometry?boundsFor(n.geometry).applyMatrix4(m):null;const material=doc.materials.find(m=>m.id===n.materialId);return {id:n.id,assemblyId:n.assemblyId??n.id,name:n.name,transform:n.transform,geometryType:n.geometry?.type,uvQuality:inspectMeshUV(n),hasUV:n.geometry?.type==='mesh'?!!n.geometry.params.uvs:true,...(b?{worldMin:b.min.toArray().map(round),worldMax:b.max.toArray().map(round),worldCenter:b.getCenter(new Vector3()).toArray().map(round)}:{}),material:material?{id:material.id,baseColor:material.baseColor,roughness:material.roughness,metalness:material.metalness}:null}})};
}
