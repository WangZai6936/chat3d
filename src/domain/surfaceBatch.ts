import type {SceneDocument} from './types';
import type {Command} from './commands';
import type {SurfaceDetail} from './textures';
import {projectMeshUV} from './uvProjection';
export interface SurfaceBatchItem {
 targetId:string; surface:SurfaceDetail;
 uvIfMissing?:{mode:'planar'|'cylindrical'|'box';axis?:'x'|'y'|'z'};
}
/** Prepare all edits before commit: one bad target cannot partially texture a model. */
export function surfaceBatchCommands(doc:SceneDocument,items:SurfaceBatchItem[]):Command[]{
 if(!Array.isArray(items)||!items.length||items.length>32)throw Error('一次表面处理需要1–32个明确部件');
 const seen=new Set<string>(),ops:Command[]=[];
 for(const item of items){
  if(seen.has(item.targetId))throw Error('同一部件不能重复设置表面');seen.add(item.targetId);
  const node=doc.nodes.find(n=>n.id===item.targetId);if(!node?.geometry)throw Error('表面目标不存在或没有几何');
  if(node.geometry.type==='mesh'&&!node.geometry.params.uvs){
   if(!item.uvIfMissing)throw Error(`${node.name}缺少UV；请明确选择基础投影，或保留原材质等待专门展开`);
   ops.push({op:'updateParameters',targetId:node.id,geometry:projectMeshUV(node,item.uvIfMissing.mode,item.uvIfMissing.axis)});
  }
  ops.push({op:'setSurface',targetId:node.id,surface:item.surface});
 }
 return ops;
}
