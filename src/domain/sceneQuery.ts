import {inspectMeshUV} from './uvQuality';
import {Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument} from './types';
import {boundsFor} from './sceneQuality';
export interface PartQuery {assemblyId?:string;terms?:string[];offset?:number;limit?:number;fields?:'placement'|'surface'|'all'}
/** Canonicalize only equivalent query syntax; selection and returned IDs stay unchanged. */
export function normalizePartQuery(q:PartQuery):PartQuery{return {assemblyId:q.assemblyId||undefined,terms:[...new Set((q.terms??[]).map(s=>s.trim().toLowerCase()).filter(Boolean))].sort(),offset:q.offset??0,limit:q.limit??16,fields:q.fields??'placement'};}
export function findSceneParts(doc:SceneDocument,q:PartQuery){
 if(q.fields&&!['placement','surface','all'].includes(q.fields))throw Error('查询字段无效');
 const surface=q.fields!=='placement';
 const limit=q.limit??16,offset=q.offset??0;if(!Number.isInteger(limit)||limit<1||limit>48||!Number.isInteger(offset)||offset<0||offset>10000||q.terms&&(!Array.isArray(q.terms)||q.terms.length>12||q.terms.some(s=>typeof s!=='string'||s.length>80)))throw Error('查询范围无效');
 if(q.assemblyId&&!doc.nodes.some(n=>(n.assemblyId??n.id)===q.assemblyId))throw Error('组件不存在');
 const aliases=[['键盘','keyboard','keypad'],['控制面板','control panel','console'],['手指','finger','thumb'],['手掌','palm','hand'],['衣袖','sleeve'],['前臂','forearm'],['握柄','handle','grip'],['门板','door'],['导轨','rail'],['主轴','spindle'],['探头','probe']];
 const requested=(q.terms??[]).map(s=>s.trim().toLowerCase()).filter(Boolean);const terms=[...new Set(requested.flatMap(term=>aliases.find(group=>group.includes(term))??[term]))];const all=doc.nodes.filter(n=>(!q.assemblyId||(n.assemblyId??n.id)===q.assemblyId)&&(!terms.length||terms.some(s=>(n.name+' '+(n.label??'')).toLowerCase().includes(s))));
 const round=(x:number)=>Math.round(x*10000)/10000;
 return {revision:doc.revision,total:all.length,offset,...(all.length===0?{availableNames:[...new Set(doc.nodes.filter(n=>!q.assemblyId||(n.assemblyId??n.id)===q.assemblyId).map(n=>n.name))].slice(0,24),next:'无名称匹配；核对真实名称或扩大组件范围，不要猜测节点ID。'}:{}),nextOffset:offset+limit<all.length?offset+limit:null,parts:all.slice(offset,offset+limit).map(n=>{const m=new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));const b=n.geometry?boundsFor(n.geometry).applyMatrix4(m):null;const material=doc.materials.find(m=>m.id===n.materialId);return {id:n.id,assemblyId:n.assemblyId??n.id,name:n.name,materialId:n.materialId,transform:n.transform,geometryType:n.geometry?.type,...(surface?{uvQuality:inspectMeshUV(n),hasUV:n.geometry?.type==='mesh'?!!n.geometry.params.uvs:true}:{}),...(b?{worldMin:b.min.toArray().map(round),worldMax:b.max.toArray().map(round),worldCenter:b.getCenter(new Vector3()).toArray().map(round)}:{}),...(surface?{material:material?{id:material.id,baseColor:material.baseColor,roughness:material.roughness,metalness:material.metalness}:null}:{})}})};
}
