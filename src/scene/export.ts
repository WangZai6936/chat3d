import {createSceneMaterial} from './material';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SceneDocument } from '../domain/types';
import { buildPrimitiveGeometry } from './geometry';

export function buildExportScene(doc: SceneDocument): THREE.Scene {
  const scene=new THREE.Scene();scene.name='chat3d';scene.userData={unit:doc.unit,projectId:doc.projectId};
  for (const n of doc.nodes) {
    if (!n.visible) continue;
    if (n.kind!=='primitive'||!n.geometry||n.parentId!==null) throw new Error('当前 GLB 导出仅支持无分组的基础模型');
    const m=doc.materials.find((v)=>v.id===n.materialId);
    const mesh=new THREE.Mesh(buildPrimitiveGeometry(n.geometry),createSceneMaterial(m,n.label));
    mesh.name=n.name;mesh.userData={nodeId:n.id,assemblyId:n.assemblyId,assemblyName:n.assemblyName,label:n.label,sceneRole:n.sceneRole,planKey:n.planKey,zone:n.zone};mesh.position.fromArray(n.transform.position);mesh.quaternion.fromArray(n.transform.rotationQuaternion);mesh.scale.fromArray(n.transform.scale);scene.add(mesh);
  }
  return scene;
}
export async function exportGlb(doc: SceneDocument): Promise<ArrayBuffer> {
  if (!doc.nodes.some((n)=>n.visible)) throw new Error('没有可导出的可见对象');
  const scene=buildExportScene(doc);
  try {
    const result=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB 导出结果格式错误');
    return result;
  } finally {
    scene.traverse((object)=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach((m)=>{(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose()})}});
  }
}
