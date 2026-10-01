import {Box3,Euler,Quaternion,Vector3,Matrix4} from 'three';
import {boundsFor} from './sceneQuality';
import type {SceneNode,Vec3} from './types';
export function assemblyBounds(nodes:SceneNode[]):Box3{
 const result=new Box3();
 for(const n of nodes){if(!n.geometry)continue;const matrix=new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));result.union(boundsFor(n.geometry).applyMatrix4(matrix));}
 return result;
}
export function transformedAssembly(nodes:SceneNode[],options:{rotationDegrees?:Vec3;scaleFactor?:number;pivot?:Vec3}):SceneNode[]{
 const {rotationDegrees=[0,0,0],scaleFactor=1}=options;
 if(!Array.isArray(rotationDegrees)||rotationDegrees.length!==3||!rotationDegrees.every(v=>Number.isFinite(v)&&Math.abs(v)<=3600))throw new Error('旋转角需为三个有限角度，范围±3600度');
 if(!Number.isFinite(scaleFactor)||scaleFactor<.001||scaleFactor>1000)throw new Error('整机缩放倍数需为0.001–1000');
 if(options.pivot&&(!Array.isArray(options.pivot)||options.pivot.length!==3||!options.pivot.every(Number.isFinite)))throw new Error('旋转缩放中心无效');
 const box=assemblyBounds(nodes);if(box.isEmpty())throw new Error('组件没有可变换几何');const center=box.getCenter(new Vector3());
 const pivot=options.pivot?new Vector3(...options.pivot):new Vector3(center.x,box.min.y,center.z);
 const q=new Quaternion().setFromEuler(new Euler(...rotationDegrees.map(v=>v*Math.PI/180) as Vec3,'XYZ'));
 return nodes.map(n=>({...structuredClone(n),transform:{position:new Vector3(...n.transform.position).sub(pivot).multiplyScalar(scaleFactor).applyQuaternion(q).add(pivot).toArray() as Vec3,rotationQuaternion:new Quaternion(...n.transform.rotationQuaternion).premultiply(q).normalize().toArray() as [number,number,number,number],scale:n.transform.scale.map(v=>v*scaleFactor) as Vec3}}));
}
