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
  if(a.assemblyId!==n.assemblyId||a.parentId!==n.parentId||a.assemblyName!==n.assemblyName)fields.push('分组');
  if(fields.length)out.push(entry(n,'modified',fields));
 }
 for(const n of before.nodes)if(!next.has(n.id))out.push(entry(n,'removed',['移除']));return out;
}
