import {materialReady,disposeMaterialTextures} from './surfaceTextures';
import {createSceneMaterial} from './material';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SceneDocument } from '../domain/types';
import { buildPrimitiveGeometry } from './geometry';

export function buildExportScene(doc: SceneDocument): THREE.Scene {
  const scene=new THREE.Scene();scene.name='Scenivo';scene.userData={unit:doc.unit,projectId:doc.projectId};
  try {
    for (const n of doc.nodes) {
      if (!n.visible) continue;
      if (n.kind!=='primitive'||!n.geometry||n.parentId!==null) throw new Error('当前场景导出仅支持无分组的基础模型');
      const m=doc.materials.find((v)=>v.id===n.materialId);
      const geometry=buildPrimitiveGeometry(n.geometry);
      let material:THREE.MeshStandardMaterial;
      try { material=createSceneMaterial(m,n.label); } catch (error) { geometry.dispose();throw error; }
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=n.name;mesh.userData={connection:n.connection,nodeId:n.id,assemblyId:n.assemblyId,assemblyName:n.assemblyName,label:n.label,sceneRole:n.sceneRole,planKey:n.planKey,zone:n.zone};mesh.position.fromArray(n.transform.position);mesh.quaternion.fromArray(n.transform.rotationQuaternion);mesh.scale.fromArray(n.transform.scale);scene.add(mesh);
    }
  } catch (error) { disposeExportScene(scene);throw error; }
  return scene;
}
export async function prepareExportMaterials(scene:THREE.Scene):Promise<void> {
  const pending:Promise<void>[]=[];
  scene.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){const ready=materialReady.get(material);if(ready)pending.push(ready);}});
  const results=await Promise.allSettled(pending);
  for(const result of results)if(result.status==='rejected')throw result.reason;
}
export function disposeExportScene(scene:THREE.Scene):void {
  scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(disposeMaterialTextures);}});
}
export async function exportGlb(doc: SceneDocument): Promise<ArrayBuffer> {
  if (!doc.nodes.some((n)=>n.visible)) throw new Error('没有可导出的可见对象');
  const scene=buildExportScene(doc);
  try {
    await prepareExportMaterials(scene);
    const result=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB 导出结果格式错误');
    return result;
  } finally {
    disposeExportScene(scene);
  }
}
