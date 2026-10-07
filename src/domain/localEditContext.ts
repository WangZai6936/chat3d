import {Box3,Vector3} from 'three';
import type {SceneDocument} from './types';
import {assemblyBounds} from './assemblyEditing';
import {findSceneParts} from './sceneQuery';
import {poseRigContext} from './poseRigExecution';
export function localEditContext(doc:SceneDocument,assemblyIds:string[],radius=1){
 if(!assemblyIds.length||assemblyIds.length>8||new Set(assemblyIds).size!==assemblyIds.length||!Number.isFinite(radius)||radius<0||radius>10)throw Error('局部上下文需1–8个不同目标，邻近范围0–10米');
 const groups=new Map<string,typeof doc.nodes>();for(const n of doc.nodes){const id=n.assemblyId??n.id;groups.set(id,[...(groups.get(id)??[]),n]);}const selected=new Set(assemblyIds);if(assemblyIds.some(id=>!groups.has(id)))throw Error('局部目标组件不存在');
 const region=new Box3();assemblyIds.forEach(id=>region.union(assemblyBounds(groups.get(id)!)));region.expandByScalar(radius);
 const neighbors=[...groups].filter(([id,nodes])=>!selected.has(id)&&nodes.some(n=>n.visible)&&region.intersectsBox(assemblyBounds(nodes))).map(([id,nodes])=>{const bounds=assemblyBounds(nodes);return {id,name:nodes[0].assemblyName??nodes[0].name,parts:nodes.length,min:bounds.min.toArray(),max:bounds.max.toArray()};});
 return {revision:doc.revision,focus:assemblyIds,targets:assemblyIds.map(id=>{const nodes=groups.get(id)!,parts=[];for(let offset=0;offset<Math.min(nodes.length,192);offset+=48)parts.push(...findSceneParts(doc,{assemblyId:id,offset,limit:Math.min(48,192-offset),fields:'placement'}).parts);return {id,name:nodes[0].assemblyName??nodes[0].name,partCount:nodes.length,parts,partsTruncated:nodes.length>parts.length,rig:poseRigContext(doc,id)};}),neighbors:neighbors.slice(0,40),neighborCount:neighbors.length,neighborsTruncated:neighbors.length>40,otherComponents:[...groups].filter(([id])=>!selected.has(id)&&!neighbors.some(n=>n.id===id)).slice(0,80).map(([id,n])=>({id,name:n[0].assemblyName??n[0].name,parts:n.length})),otherComponentCount:groups.size-selected.size-neighbors.length,otherComponentsTruncated:groups.size-selected.size-neighbors.length>80,totalComponents:groups.size,limitations:'邻近对象只提供包围盒候选；其余模型仍完整保留。此上下文不改变修改授权范围，也不代替全场碰撞或视觉复核。',center:region.getCenter(new Vector3()).toArray()};
}
