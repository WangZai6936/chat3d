import type {SceneDocument,SceneNode} from './types';
export interface EditScope {nodeIds?:string[];lockPlacement?:boolean;allowAssemblyAdditions?:boolean}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function checkEditScope(before:SceneDocument,after:SceneDocument,scope?:EditScope):string[]{
 if(!scope)return [];
 const errors:string[]=[],allowed=scope.nodeIds?new Set(scope.nodeIds):null;
 if(allowed&&(!allowed.size||[...allowed].some(id=>!before.nodes.some(n=>n.id===id))))return ['局部修改范围无效，请重新选择对象'];
 const next=new Map(after.nodes.map(n=>[n.id,n]));
 const oldIds=new Set(before.nodes.map(n=>n.id));
 const fullySelected=new Set<string>();
 if(allowed&&scope.allowAssemblyAdditions){const counts=new Map<string,[number,number]>();for(const n of before.nodes){const key=n.assemblyId??n.id,entry=counts.get(key)??[0,0];entry[0]++;if(allowed.has(n.id))entry[1]++;counts.set(key,entry);}for(const [id,[total,selected]] of counts)if(total===selected)fullySelected.add(id);}
 if(allowed&&after.nodes.some(n=>!oldIds.has(n.id)&&(!scope.allowAssemblyAdditions||!n.assemblyId||!fullySelected.has(n.assemblyId))))errors.push('当前范围不允许新增此对象；只可给完整选中的组件追加部件，或切换全场景范围');
 for(const n of before.nodes){
  const b=next.get(n.id);
  if(allowed&&!allowed.has(n.id)){
   const oldMat=before.materials.find(m=>m.id===n.materialId),newMat=after.materials.find(m=>m.id===b?.materialId);
   if(!b||!same(n,b)||!same(oldMat,newMat))errors.push(`超出修改范围：${n.name}`);
  }
  if(scope.lockPlacement&&(!b||!same(n.transform.position,b.transform.position)||!same(n.transform.rotationQuaternion,b.transform.rotationQuaternion)))errors.push(`位置与朝向已锁定：${n.name}`);
 }
 if(allowed){
  const animationAllowed=new Set(allowed);for(const n of after.nodes)if(!oldIds.has(n.id)&&n.assemblyId&&fullySelected.has(n.assemblyId))animationAllowed.add(n.id);
  const unselected=(d:SceneDocument)=>(d.animation?.tracks??[]).filter(t=>t.targetIds.some(id=>!animationAllowed.has(id))).map(t=>({...structuredClone(t),targetIds:t.targetIds.filter(id=>!animationAllowed.has(id))}));
  if(!same(unselected(before),unselected(after)))errors.push('动画修改超出选中范围，必须保留其他对象的动画轨道');
  const changed=new Set<string>();
  const nodeTracks=(d:SceneDocument,id:string)=>(d.animation?.tracks??[]).filter(t=>t.targetIds.includes(id)).map(t=>({...t,targetIds:[id]}));
  for(const n of before.nodes)if(!same(n.transform,next.get(n.id)?.transform)||!same(nodeTracks(before,n.id),nodeTracks(after,n.id)))changed.add(n.id);
  const followers=[...(before.animation?.tracks??[]),...(after.animation?.tracks??[])].filter(t=>t.channel==='follow');
  for(let i=0;i<16;i++)for(const track of followers)if(track.sourceId&&changed.has(track.sourceId))for(const id of track.targetIds)changed.add(id);
  if([...changed].some(id=>oldIds.has(id)&&!animationAllowed.has(id)))errors.push('动画或绑定变化会间接影响未选中对象，请扩展选择范围后重试');
  if(unselected(before).length&&(before.animation?.duration!==after.animation?.duration||before.animation?.loop!==after.animation?.loop))errors.push('动画总时长或循环会影响未选中对象，请切换全场景范围');
 }
 return errors.slice(0,8);
}
export interface SceneChange {id:string;name:string;group:string;kind:'added'|'modified'|'removed';fields:string[]}
export function sceneChanges(before:SceneDocument,after:SceneDocument):SceneChange[]{
 const old=new Map(before.nodes.map(n=>[n.id,n])),next=new Map(after.nodes.map(n=>[n.id,n]));const out:SceneChange[]=[];
 const entry=(n:SceneNode,kind:SceneChange['kind'],fields:string[])=>({id:n.id,name:n.name,group:n.assemblyName??n.name,kind,fields});
 for(const n of after.nodes){const a=old.get(n.id);if(!a){out.push(entry(n,'added',['新增']));continue;}const fields:string[]=[];
  if(!same(a.geometry,n.geometry))fields.push('形状/尺寸');
  if(!same(a.transform,n.transform))fields.push('位置/旋转/缩放');
  if(!same(before.materials.find(m=>m.id===a.materialId),after.materials.find(m=>m.id===n.materialId)))fields.push('颜色/材质');
  if(a.visible!==n.visible)fields.push('显示状态');if(a.name!==n.name)fields.push('名称');
  if(a.sceneRole!==n.sceneRole||a.planKey!==n.planKey||a.zone!==n.zone||a.label!==n.label)fields.push('区域/分类/标注');
  if(!same(a.modelStructure,n.modelStructure))fields.push('结构关联');
  if(a.assemblyId!==n.assemblyId||a.parentId!==n.parentId||a.assemblyName!==n.assemblyName)fields.push('分组');
  if(fields.length)out.push(entry(n,'modified',fields));
 }
 if(!same(before.animation,after.animation))out.push({id:'__animation__',name:after.animation?.name??before.animation?.name??'动画',group:'场景动画',kind:before.animation?after.animation?'modified':'removed':'added',fields:['动画轨道/时序/运动表达式']});
 for(const n of before.nodes)if(!next.has(n.id))out.push(entry(n,'removed',['移除']));return out;
}
