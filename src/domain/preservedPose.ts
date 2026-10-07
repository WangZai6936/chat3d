import {Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument,Vec3} from './types';
import {validateVec3} from './types';
import {applyBatch,type Command} from './commands';
export function preserveAssetShapeIntent(text:string,history:{role:string;text:string}[]=[]){
 const brief=/^(?:开始|继续)(?:调整|修改|执行)?[吧啊。！!\s]*$|^(?:好|好的|可以)[吧啊。！!\s]*$/;
 const intent=brief.test(text.trim())?[...history.slice(-6).map(m=>m.text),text].join('\n'):text;
 const clauses=text.split(/[，,。；;\n]/),explicitRebuild=!brief.test(text.trim())&&clauses.some(c=>/(?:重建|重新建模|替换|更换).{0,8}(?:人物|模型|网格|手臂|衣袖)/.test(c)&&!/(?:不要|无需|禁止|不必|不用|不能|不需要)/.test(c));
 const preserve=clauses.some(c=>/(?:保留|保持|不改变).{0,12}(?:外形|外观|原模型|模型形状)/.test(c)&&!/(?:不要|无需|不用|不必|不需要).{0,3}(?:保留|保持)/.test(c));
 if(explicitRebuild&&!preserve)return false;
 return /姿态|手势|手臂|扶箱|握.{0,8}(?:工具|封箱器)|pose|posture/i.test(intent)||preserve;
}
/** Changes must retain the asset's geometry, appearance, identity and scale. */
export function assertPreservedAssetShape(before:SceneDocument,after:SceneDocument){
 const groups=new Set(before.nodes.filter(n=>n.modelAsset).map(n=>n.assemblyId??n.id));
 const protectedNodes=before.nodes.filter(n=>groups.has(n.assemblyId??n.id)),ids=new Set(protectedNodes.map(n=>n.id));
 for(const n of protectedNodes){const next=after.nodes.find(x=>x.id===n.id);if(!next||JSON.stringify([n.kind,n.parentId,n.assemblyId,n.geometry,n.materialId,n.visible,n.transform.scale,n.modelAsset])!==JSON.stringify([next.kind,next.parentId,next.assemblyId,next.geometry,next.materialId,next.visible,next.transform.scale,next.modelAsset]))throw Error('本次需保留资产原外形，不能删除、替换、缩放或换材质：'+n.name+'。请用pose_existing_parts旋转原部件；原模型无法独立转动时保留原状并说明需要关节拆分或骨骼绑定，不得重建手袖冒充调姿态。');}
 for(const n of after.nodes)if(!ids.has(n.id)&&groups.has(n.assemblyId??n.id))throw Error('保形姿态编辑不能向原资产叠加新零件遮盖旧手袖');
 for(const id of new Set(protectedNodes.map(n=>n.materialId))){if(JSON.stringify(before.materials.find(m=>m.id===id))!==JSON.stringify(after.materials.find(m=>m.id===id)))throw Error('保形姿态编辑不能改写原资产材质');}
 return protectedNodes.length;
}
export interface ExistingJointRotation {nodeIds:string[];pivot:Vec3;axis:Vec3;angle:number}
/** Rigid articulation of existing separate parts. Not mesh deformation or automatic rigging. */
export function existingPoseCommands(doc:SceneDocument,assemblyId:string,joints:ExistingJointRotation[]):Command[]{
 const members=doc.nodes.filter(n=>(n.assemblyId??n.id)===assemblyId);if(!members.length)throw Error('姿态目标组件不存在');
 if(!joints.length||joints.length>12)throw Error('一次需要1–12个关节步骤');let working=doc;const commands:Command[]=[];
 for(const j of joints){if(!j.nodeIds.length||j.nodeIds.length>128||new Set(j.nodeIds).size!==j.nodeIds.length||j.nodeIds.some(id=>!members.some(n=>n.id===id)))throw Error('关节步骤只能引用该组件现有且不重复的部件ID');if(validateVec3(j.pivot,'pivot').length||validateVec3(j.axis,'axis').length||!Number.isFinite(j.angle)||Math.abs(j.angle)>360)throw Error('关节轴、中心或角度无效');const axis=new Vector3(...j.axis);if(axis.length()<1e-8)throw Error('关节轴不能为零');const delta=new Quaternion().setFromAxisAngle(axis.normalize(),j.angle*Math.PI/180),pivot=new Vector3(...j.pivot);
 const step:Command[]=[];for(const id of j.nodeIds){const n=working.nodes.find(n=>n.id===id)!;if(n.parentId!==null)throw Error('有层级的模型需先确认关节坐标，不能猜测变换');const position=new Vector3(...n.transform.position).sub(pivot).applyQuaternion(delta).add(pivot),rotation=delta.clone().multiply(new Quaternion(...n.transform.rotationQuaternion)).normalize();step.push({op:'setTransform',targetId:id,transform:{position:position.toArray() as Vec3,rotationQuaternion:rotation.toArray() as [number,number,number,number]}});}
 const applied=applyBatch(working,{operations:step});if(applied.errors.length)throw Error(applied.errors.map(e=>e.message).join('；'));working=applied.doc;commands.push(...step);
 }
 assertPreservedAssetShape(doc,working);return commands;
}

/** Global relocation alone is not evidence of a hand/arm pose change. */
export function hasAssetPoseChange(before:SceneDocument,after:SceneDocument,articulated=false){
 const assetGroups=new Set(before.nodes.filter(n=>n.modelAsset).map(n=>n.assemblyId??n.id));
 const groups=new Map<string,typeof before.nodes>();for(const n of before.nodes.filter(n=>assetGroups.has(n.assemblyId??n.id))){const key=n.assemblyId??n.id;groups.set(key,[...(groups.get(key)??[]),n]);}
 const matrix=(n:typeof before.nodes[number])=>new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));
 for(const nodes of groups.values()){if(nodes.some(n=>{const next=after.nodes.find(x=>x.id===n.id);return next&&JSON.stringify(n.geometry)!==JSON.stringify(next.geometry)}))return true;const deltas=nodes.map(n=>{const next=after.nodes.find(x=>x.id===n.id);return next?matrix(next).multiply(matrix(n).invert()):new Matrix4();});if(articulated){if(deltas.length>1&&deltas.some(d=>d.elements.some((v,i)=>Math.abs(v-deltas[0].elements[i])>1e-6)))return true;}else if(deltas.some(d=>d.elements.some((v,i)=>Math.abs(v-new Matrix4().elements[i])>1e-6)))return true;}
 return false;
}
