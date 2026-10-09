import {transformedAssembly} from './assemblyEditing';
import {validateMaterial,type Material,type SceneDocument,type SceneNode,type Vec3} from './types';
import {makeId} from '../util/ids';
import type {Command} from './commands';

export type SelectionChange={kind:'position';value:Vec3}|{kind:'rotation';value:Vec3}|{kind:'size';value:number}|{kind:'color';value:string}|{kind:'appearance';value:Partial<Pick<Material,'baseColor'|'roughness'|'metalness'|'opacity'>>&{materialId?:string}};
function selectedNodes(doc:SceneDocument,ids:string[]):SceneNode[]{
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('请先选择可编辑对象');
 const selected=new Set(ids),existing=new Set(doc.nodes.map(n=>n.id));
 if([...selected].some(id=>!existing.has(id)))throw Error('选中对象已变化，请重新选择；尚未修改任何对象。');
 const nodes=doc.nodes.filter(n=>selected.has(n.id)&&n.geometry);if(!nodes.length)throw Error('请先选择可编辑对象');return nodes;
}
function validateChange(change:SelectionChange):void {
 if(!change||!['position','rotation','size','color','appearance'].includes(change.kind))throw Error('不支持的属性修改');
 if(change.kind==='position'&&(!Array.isArray(change.value)||change.value.length!==3||!change.value.every(Number.isFinite)))throw Error('位移需为三个有限数值');
 if(change.kind==='rotation'&&(!Array.isArray(change.value)||change.value.length!==3||!change.value.every(v=>Number.isFinite(v)&&Math.abs(v)<=3600)))throw Error('旋转角需为三个有限角度，范围±3600度');
 if(change.kind==='size'&&(!Number.isFinite(change.value)||change.value<.001||change.value>1000))throw Error('整机缩放倍数需为0.001–1000');
 if(change.kind==='appearance'&&(!change.value||typeof change.value!=='object'||!Object.keys(change.value).length||Object.keys(change.value).some(k=>!['baseColor','roughness','metalness','opacity','materialId'].includes(k))))throw Error('外观修改参数无效');
 if(change.kind==='color'&&(typeof change.value!=='string'||!/^#[\da-f]{6}$/i.test(change.value)))throw Error('颜色需为六位十六进制色值');
}
/** A manual aggregate edit, not a larger AI command budget. No assembly expansion.
 * One linear selection pass, one document validation, one history snapshot.
 * The synchronous transaction can be dismissed before Apply and undone after it;
 * it never publishes partially modified nodes or progress between chunks. */
export function selectionPropertyCommands(doc:SceneDocument,ids:string[],change:SelectionChange):Command[]{
 validateChange(change);const nodes=selectedNodes(doc,ids);
 return [{op:'editSelection',targetIds:nodes.map(n=>n.id),change:structuredClone(change)}];
}
export function editSelectedProperties(doc:SceneDocument,ids:string[],change:SelectionChange):Pick<SceneDocument,'nodes'|'materials'>{
 validateChange(change);const selected=selectedNodes(doc,ids),selectedIds=new Set(selected.map(n=>n.id));
 let edited:SceneNode[],materials=doc.materials;
 if(change.kind==='rotation'||change.kind==='size')edited=transformedAssembly(selected,change.kind==='size'?{scaleFactor:change.value}:{rotationDegrees:change.value});
 else if(change.kind==='position')edited=selected.map(n=>({...n,transform:{...n.transform,position:n.transform.position.map((v,i)=>v+change.value[i]) as Vec3}}));
 else {
  // One derived material per source appearance; retain roughness, textures, etc.
  const {materialId,...patch}=change.kind==='color'?{materialId:undefined,baseColor:change.value}:change.value;
  materials=doc.materials.slice();const byId=new Map(materials.map(m=>[m.id,m])),remap=new Map<string,string>(),appearances=new Map(materials.map(({id,...properties})=>[JSON.stringify(properties),id]));
  if(materialId!==undefined&&!byId.has(materialId))throw Error('目标材质不存在');
  edited=selected.map(n=>{const source=byId.get(materialId??n.materialId??'')??materials[0];if(!source)throw Error('当前材质不存在');if(!Object.keys(patch).length)return {...n,materialId:source.id};let id=remap.get(source.id);
   if(!id){const {id:sourceId,...properties}={...source,...patch};const errors=validateMaterial({id:sourceId,...properties});if(errors.length)throw errors[0];const key=JSON.stringify(properties);id=appearances.get(key);if(!id){id=makeId();materials.push({id,...properties});appearances.set(key,id);}remap.set(source.id,id);}return {...n,materialId:id};});
 }
 const byId=new Map(edited.map(n=>[n.id,n]));return {nodes:doc.nodes.map(n=>selectedIds.has(n.id)?byId.get(n.id)!:n),materials};
}
