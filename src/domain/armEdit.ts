import type {SceneDocument} from './types';
import type {Command} from './commands';
import {buildArmInteraction,type ArmInteraction,buildBimanualInteraction} from './interactionPose';
export type ArmEdit = ArmInteraction & {assemblyId:string;replaceIds:string[];skinMaterialId:string;sleeveMaterialId:string};
export function armEditCommands(doc:SceneDocument,arms:ArmEdit[]){
 if(arms.length<1||arms.length>2)throw Error('需要一至两条手臂');
 if(arms.length===2&&arms[0].assemblyId!==arms[1].assemblyId)throw Error('双手必须属于同一人物');
 const allIds=arms.flatMap(a=>a.replaceIds);if(new Set(allIds).size!==allIds.length)throw Error('左右手替换范围不能重复');
 const targets=arms.map(a=>{
  const members=doc.nodes.filter(n=>(n.assemblyId??n.id)===a.assemblyId);if(!members.length||!members.some(n=>n.sceneRole==='person'))throw Error('人物组件不存在');
  if(!a.replaceIds.length||a.replaceIds.length>30||a.replaceIds.some(id=>!members.some(n=>n.id===id&&/hand|finger|palm|thumb|sleeve|forearm|upper arm|手|袖|前臂|上臂/i.test(n.name))))throw Error('替换范围只能是明确的手部或衣袖');
  if(doc.nodes.some(n=>n.connection&&a.replaceIds.includes(n.connection.targetId)&&!allIds.includes(n.id)))throw Error('被替换部件仍有外部连接引用，请先处理');
  if(![a.skinMaterialId,a.sleeveMaterialId].every(id=>doc.materials.some(m=>m.id===id)))throw Error('材质不存在');
  return members[0].id;
 });
 const results=arms.length===2?buildBimanualInteraction(arms).arms:arms.map(buildArmInteraction);
 const transform={position:[0,0,0] as [number,number,number],rotationQuaternion:[0,0,0,1] as [number,number,number,number],scale:[1,1,1] as [number,number,number]};
 const parts=arms.flatMap((a,i)=>[{name:a.hand.handedness+' continuous sleeve',geometry:results[i].sleeve,materialId:a.sleeveMaterialId,transform},{name:a.hand.handedness+' articulated hand',geometry:results[i].hand.geometry,materialId:a.skinMaterialId,transform}]);
 // One replacement operation also avoids an anchor being removed by the first arm.
 const commands:Command[]=[{op:'replaceAssemblyParts',targetId:targets[0],partIds:allIds,parts}];
 return {commands,results};
}
