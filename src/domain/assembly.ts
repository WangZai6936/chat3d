import {Matrix4,Quaternion as Q,Vector3} from 'three';
import {makeId} from '../util/ids';
import type {Geometry,SceneNode,Transform,Vec3,Quaternion} from './types';
import {validateGeometry,validateQuaternion,validateVec3} from './types';
export interface AssemblyPart {name:string;geometry:Geometry;materialId?:string;transform:Transform;repeat?:{count:number;step:Vec3}}
export interface AssemblyDefinition {name:string;position?:Vec3;yaw?:number;parts:AssemblyPart[]}
// User/model-defined recipe only: no equipment catalogue or industrial defaults.
export function buildAssembly(def:AssemblyDefinition):SceneNode[]{
 if(!def.name?.trim()||def.name.length>120||!Array.isArray(def.parts)||!def.parts.length||def.parts.length>100)throw new Error('组合需要名称和1–100条自定义部件定义');
 const position=def.position??[0,0,0],yaw=def.yaw??0;
 if(validateVec3(position,'组合位置').length||!Number.isFinite(yaw))throw new Error('组合位置或角度无效');
 let total=0;
 for(const p of def.parts){const t=p.transform,repeat=p.repeat;if(!p.name?.trim()||p.name.length>100||validateGeometry(p.geometry).length||!t||validateVec3(t.position,'零件位置').length||validateVec3(t.scale,'零件缩放').length||t.scale.some(n=>n<=0)||validateQuaternion(t.rotationQuaternion,'零件旋转').length)throw new Error('组合部件参数无效');
  if(repeat&&(!Number.isSafeInteger(repeat.count)||repeat.count<1||repeat.count>100||validateVec3(repeat.step,'阵列间距').length))throw new Error('阵列需要1–100整数数量及三维间距');total+=repeat?.count??1;
 }
 if(total>2000)throw new Error('单个组合超过2000零件上限');
 const root=new Matrix4().compose(new Vector3(...position),new Q().setFromAxisAngle(new Vector3(0,1,0),yaw*Math.PI/180),new Vector3(1,1,1));
 const assemblyId=makeId(),nodes:SceneNode[]=[];
 for(const part of def.parts)for(let i=0;i<(part.repeat?.count??1);i++){
  const p=new Vector3(...part.transform.position);if(part.repeat)p.addScaledVector(new Vector3(...part.repeat.step),i);
  const matrix=new Matrix4().compose(p,new Q(...part.transform.rotationQuaternion),new Vector3(...part.transform.scale)).premultiply(root),q=new Q(),scale=new Vector3();matrix.decompose(p,q,scale);q.normalize();
  nodes.push({id:nodes.length?makeId():assemblyId,assemblyId,assemblyName:def.name,name:`${def.name} · ${part.name}${part.repeat?' '+(i+1):''}`,kind:'primitive',parentId:null,visible:true,geometry:structuredClone(part.geometry),materialId:part.materialId??'mat_gray',transform:{position:p.toArray() as Vec3,rotationQuaternion:q.toArray() as Quaternion,scale:scale.toArray() as Vec3}});
 }
 return nodes;
}
