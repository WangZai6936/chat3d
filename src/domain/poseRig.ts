import {Matrix4,Quaternion,Vector3} from 'three';
import type {SceneNode,Vec3} from './types';
export interface PoseJoint {key:string;name:string;anchorNodeId:string;pivot:Vec3;axis:Vec3;memberIds:string[]}
export interface PoseAnchor {key:string;name:string;nodeId:string;point:Vec3;kind:'grip'|'contact'|'custom'}
export interface PoseRig {version:1;joints:PoseJoint[];anchors:PoseAnchor[];shapes:Record<string,string>}
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=10000);
const key=(v:unknown):v is string=>typeof v==='string'&&!['__proto__','constructor','prototype'].includes(v)&&/^[-\w]{1,100}$/.test(v);
export function shapeStamp(n:SceneNode){const text=JSON.stringify(n.geometry??null);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return `${text.length}:${a>>>0}:${b>>>0}`;}
export function poseRigSchema(rig:PoseRig){
 if(!rig||rig.version!==1||!Array.isArray(rig.joints)||rig.joints.length>24||!Array.isArray(rig.anchors)||rig.anchors.length>64||(!rig.joints.length&&!rig.anchors.length)||!rig.shapes||typeof rig.shapes!=='object'||Array.isArray(rig.shapes)||Object.keys(rig.shapes).length>256)throw Error('关节与抓握点记录格式无效');
 const seen=new Set<string>();for(const item of [...rig.joints,...rig.anchors]){if(!key(item.key)||seen.has(item.key)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80)throw Error('关节/抓握点名称和标识无效或重复');seen.add(item.key);}
 for(const j of rig.joints)if(!key(j.anchorNodeId)||!vector(j.pivot)||!vector(j.axis)||Math.abs(Math.hypot(...j.axis)-1)>1e-4||!Array.isArray(j.memberIds)||!j.memberIds.length||j.memberIds.length>128||new Set(j.memberIds).size!==j.memberIds.length||j.memberIds.some(id=>!key(id)))throw Error('关节需要有效局部中心、单位轴和真实部件编号');
 for(const a of rig.anchors)if(!key(a.nodeId)||!vector(a.point)||!['grip','contact','custom'].includes(a.kind))throw Error('抓握点需要有效局部坐标和部件编号');
 for(const [id,stamp] of Object.entries(rig.shapes))if(!key(id)||typeof stamp!=='string'||!/^\d+:\d+:\d+$/.test(stamp))throw Error('关节几何签名无效');
}
const refs=(rig:PoseRig)=>[...new Set([...rig.joints.flatMap(j=>[j.anchorNodeId,...j.memberIds]),...rig.anchors.map(a=>a.nodeId)])];
export function validatePoseRig(rig:PoseRig,nodes:SceneNode[]){poseRigSchema(rig);const ids=refs(rig);for(const id of ids){const n=nodes.find(n=>n.id===id);if(!n?.geometry||n.parentId!==null||rig.shapes[id]!==shapeStamp(n))throw Error('已保存关节/抓握点失效：部件被替换、删除或几何变化，请重新标定');}}
export function createPoseRig(nodes:SceneNode[],joints:PoseJoint[],anchors:PoseAnchor[]):PoseRig{const rig:PoseRig={version:1,joints:structuredClone(joints),anchors:structuredClone(anchors),shapes:{}};for(const id of refs(rig)){const n=nodes.find(n=>n.id===id);if(!n?.geometry)throw Error('关节只能引用目标组件内的真实部件');rig.shapes[id]=shapeStamp(n);}validatePoseRig(rig,nodes);return rig;}
export function remapPoseRig(rig:PoseRig|undefined,ids:Map<string,string>):PoseRig|undefined{if(!rig||refs(rig).some(id=>!ids.has(id)))return undefined;return {...structuredClone(rig),joints:rig.joints.map(j=>({...structuredClone(j),anchorNodeId:ids.get(j.anchorNodeId)!,memberIds:j.memberIds.map(id=>ids.get(id)!)})),anchors:rig.anchors.map(a=>({...structuredClone(a),nodeId:ids.get(a.nodeId)!})),shapes:Object.fromEntries(Object.entries(rig.shapes).filter(([id])=>ids.has(id)).map(([id,v])=>[ids.get(id)!,v]))};}
export function rigWorldPoint(n:SceneNode,point:Vec3):Vec3{return new Vector3(...point).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))).toArray() as Vec3;}
export function rigWorldAxis(n:SceneNode,axis:Vec3):Vec3{return new Vector3(...axis).transformDirection(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))).toArray() as Vec3;}
export function worldPoseRig(nodes:SceneNode[],joints:PoseJoint[],anchors:PoseAnchor[]):PoseRig{
 const inverse=(id:string)=>{const n=nodes.find(n=>n.id===id);if(!n)throw Error('标定点所属部件不存在');return new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale)).invert();};
 return createPoseRig(nodes,joints.map(j=>({...j,pivot:new Vector3(...j.pivot).applyMatrix4(inverse(j.anchorNodeId)).toArray() as Vec3,axis:new Vector3(...j.axis).transformDirection(inverse(j.anchorNodeId)).toArray() as Vec3})),anchors.map(a=>({...a,point:new Vector3(...a.point).applyMatrix4(inverse(a.nodeId)).toArray() as Vec3})));
}
