import * as THREE from 'three';
import {createWorkshop} from './model';
import {makeId} from '../util/ids';
import type {Geometry,SceneNode,Vec3,Quaternion} from '../domain/types';
export function validateWorkshopParameters(p:Record<string,number>={}){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['lines','people','materialZone','qualityZone'].includes(k)))throw new Error('车间参数支持 lines、people、materialZone、qualityZone');
 if(p.lines!==undefined&&p.lines!==1&&p.lines!==2)throw new Error('生产线数量只支持1或2');
 for(const key of ['people','materialZone','qualityZone'])if(p[key]!==undefined&&p[key]!==0&&p[key]!==1)throw new Error(`${key} 必须为0或1`);
}
export function buildWorkshopNodes(p:Record<string,number>={},position:Vec3=[0,0,0],yaw=0):SceneNode[]{
 validateWorkshopParameters(p);if(position.length!==3||![...position,yaw].every(Number.isFinite))throw new Error('车间位置或朝向无效');
 const w=createWorkshop({text:false,lines:p.lines??2,people:p.people!==0,materialZone:p.materialZone!==0,qualityZone:p.qualityZone!==0});
 const root=w.root as THREE.Group;root.position.fromArray(position);root.rotation.y=yaw*Math.PI/180;root.updateMatrixWorld(true);
 const names=new Map<THREE.Material,string>(Object.entries(w.mats).map(([key,m])=>[m as THREE.Material,'ws_'+key]));
 const assemblies=new Map<THREE.Object3D,string>();const nodes:SceneNode[]=[];const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
 const envId=makeId();let envFirst=true;let part=0;
 try{root.traverse(object=>{
  if(!(object as THREE.Mesh).isMesh)return;const mesh=object as THREE.Mesh;const geometry=mesh.geometry as THREE.BufferGeometry & {parameters:Record<string,number>};const a=geometry.parameters;let g:Geometry;
  if(geometry.type==='RoundedBoxGeometry'||geometry.type==='BoxGeometry')g={type:'box',params:{width:a.width,height:a.height,depth:a.depth,bevelRadius:a.radius??0}};
  else if(geometry.type==='CylinderGeometry')g={type:'cylinder',params:{radiusTop:a.radiusTop,radiusBottom:a.radiusBottom,height:a.height,radialSegments:a.radialSegments}};
  else if(geometry.type==='SphereGeometry')g={type:'sphere',params:{radius:a.radius,widthSegments:a.widthSegments,heightSegments:a.heightSegments}};
  else if(geometry.type==='PlaneGeometry')g={type:'plane',params:{width:a.width,depth:a.height,widthSegments:1,depthSegments:1}};
  else throw new Error(`不支持的组件几何 ${geometry.type}`);
  let entity:THREE.Object3D|undefined=mesh.userData.entity;
  if(!entity){let parent=mesh.parent;while(parent&&parent!==root){if(parent.userData.title){entity=parent;break;}parent=parent.parent;}}
  let assemblyId=envId,id:string,assemblyName='车间环境',zone='厂房与通道';
  if(entity){const first=!assemblies.has(entity);if(first)assemblies.set(entity,makeId());assemblyId=assemblies.get(entity)!;id=first?assemblyId:makeId();assemblyName=[entity.userData.code,entity.userData.title].filter(Boolean).join(' · ');zone=entity.userData.zone??'车间';}
  else{id=envFirst?envId:makeId();envFirst=false;}
  mesh.matrixWorld.decompose(pos,quat,scale);quat.normalize();const label=typeof mesh.userData.label==='string'?mesh.userData.label:undefined;
  nodes.push({id,assemblyId,assemblyName,zone,...(label?{label}:{}),parentId:null,name:`${assemblyName} · ${label??'零件 '+(++part)}`,kind:'primitive',geometry:g,materialId:names.get(mesh.material as THREE.Material)??'ws_label',transform:{position:pos.toArray() as Vec3,rotationQuaternion:quat.toArray() as Quaternion,scale:scale.toArray() as Vec3},visible:true});
 });return nodes;}finally{const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();root.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh){geos.add(mesh.geometry);(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>mats.add(m));}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
}
