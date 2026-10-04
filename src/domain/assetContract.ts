import {Vector3,Matrix4,Matrix3,Quaternion} from 'three';
import type {SceneNode,Vec3,Material} from './types';
export const ANCHOR_KINDS=['operation','grip','input','output','mount','support','custom'] as const;
export type AnchorKind=typeof ANCHOR_KINDS[number];
export interface AssetAnchor {id:string;name:string;kind:AnchorKind;nodeId:string;point:Vec3;normal:Vec3}
export interface AssetContract {purpose:string;features:string[];anchors:AssetAnchor[];clearance?:{min:Vec3;max:Vec3}}
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000);
export function validateAssetContract(c:AssetContract,nodes:SceneNode[]):void{
 if(!c||typeof c.purpose!=='string'||c.purpose.length>600||!Array.isArray(c.features)||c.features.length>24||c.features.some(s=>typeof s!=='string'||!s.trim()||s.length>160)||!Array.isArray(c.anchors)||c.anchors.length>64)throw Error('资产用途、特征或连接点格式无效');
 const ids=new Set(nodes.map(n=>n.id)),keys=new Set<string>();
 for(const a of c.anchors){if(!a||!/^[-a-zA-Z0-9_]{1,80}$/.test(a.id)||keys.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>80||!ANCHOR_KINDS.includes(a.kind)||!ids.has(a.nodeId)||!vector(a.point)||!vector(a.normal)||Math.abs(Math.hypot(...a.normal)-1)>1e-4)throw Error('连接点必须有唯一标识、真实零件、有限坐标及单位法线');keys.add(a.id);}
 if(c.clearance&&(!vector(c.clearance.min)||!vector(c.clearance.max)||c.clearance.min.some((n,i)=>n>=c.clearance!.max[i])))throw Error('安全范围必须有有效的最小和最大边界');
}
export function nodeMatrix(n:SceneNode):Matrix4{return new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));}
export function worldAnchor(a:AssetAnchor,n:SceneNode){const m=nodeMatrix(n);return {point:new Vector3(...a.point).applyMatrix4(m).toArray() as Vec3,normal:new Vector3(...a.normal).applyMatrix3(new Matrix3().getNormalMatrix(m)).normalize().toArray() as Vec3};}
export function anchorCompatibility(a:AnchorKind,b:AnchorKind):boolean{return a==='custom'||b==='custom'||(a==='input'&&b==='output')||(a==='output'&&b==='input')||(a==='mount'&&b==='support')||(a==='support'&&b==='mount')||(a==='grip'&&b==='grip')||(a==='operation'&&b==='operation');}
export function geometryPayload(nodes:SceneNode[],materials:Material[]):string{return JSON.stringify({nodes:nodes.map(({id,geometry,transform,materialId,visible,connection,modelStructure})=>({id,geometry,transform,materialId,visible,connection,modelStructure})),materials});}
