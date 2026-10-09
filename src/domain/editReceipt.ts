import type {SceneDocument,SceneNode} from './types';
const equal=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
/** Receipt of an accepted atomic edit. Full geometry remains in the canonical document. */
export function editReceipt(before:SceneDocument,after:SceneDocument){
 const old=new Map(before.nodes.map(n=>[n.id,n])),now=new Set(after.nodes.map(n=>n.id)),oldMaterials=new Map(before.materials.map(m=>[m.id,m]));
 const changedMaterials=new Set(after.materials.filter(m=>!equal(m,oldMaterials.get(m.id))).map(m=>m.id));
 const changed=after.nodes.filter(n=>!equal(n,old.get(n.id))||(!!n.materialId&&changedMaterials.has(n.materialId)));
 const removedIds=before.nodes.filter(n=>!now.has(n.id)).map(n=>n.id);
 const touched=new Set(changed.map(n=>n.assemblyId??n.id));for(const id of removedIds){const n=old.get(id)!;touched.add(n.assemblyId??id);}
 const groups=new Map<string,SceneNode[]>();for(const n of after.nodes){const key=n.assemblyId??n.id;if(touched.has(key)){const group=groups.get(key);if(group)group.push(n);else groups.set(key,[n]);}}
 const summary=(n:SceneNode)=>({id:n.id,name:n.assemblyName??n.name,assemblyId:n.assemblyId,position:n.transform.position,rotationQuaternion:n.transform.rotationQuaternion,scale:n.transform.scale,materialId:n.materialId,visible:n.visible,parentId:n.parentId,geometryType:n.geometry?.type,sceneRole:n.sceneRole,zone:n.zone});
 const nodes=[...groups].map(([id,parts])=>({...summary(parts.find(n=>n.id===id)??parts[0]),partCount:parts.length,positionMeaning:parts.length>1?'anchor-node transform; not component center':'node transform'}));
 const changedParts=changed.slice(0,48).map(n=>({...summary(n),name:n.name}));
 const used=new Set([...nodes,...changedParts].map(n=>n.materialId));
 return {revision:after.revision,mode:'edit-delta',totalNodes:after.nodes.length,changedNodeCount:changed.length,unchangedNodeCount:after.nodes.length-changed.length,nodes,changedParts,changedPartsTruncated:changed.length>changedParts.length,removedIds,materials:after.materials.filter(m=>used.has(m.id)||changedMaterials.has(m.id)).map(({maps,...m})=>({...m,...(maps?{textureChannels:Object.keys(maps)}:{})})),animationChanged:!equal(before.animation,after.animation),next:'仅包含本次变更，不是完整场景。其他对象保持原样。需要精确形状或更多零件时，用read_scene({assemblyId:组件ID})或find_scene_parts分页查询；不要凭摘要重建已有模型。'};
}
