import {BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument,Geometry,Vec3} from './types';
import {validateGeometry,validateVec3} from './types';
import type {Command} from './commands';
import {existingPoseCommands} from './preservedPose';
export interface MeshBend {assemblyId:string;nodeId:string;pivot:Vec3;axis:Vec3;movingDirection:Vec3;blendWidth:number;angle:number;followNodeIds:string[]}
/** Smooth rotational deformation of existing vertices. No topology replacement or automatic rig inference. */
export function bendExistingMesh(doc:SceneDocument,a:MeshBend){
 const node=doc.nodes.find(n=>n.id===a.nodeId);
 if(!node||node.kind!=='primitive'||node.geometry?.type!=='mesh'||node.parentId!==null||(node.assemblyId??node.id)!==a.assemblyId)throw Error('弯曲需要目标组件内的独立mesh节点');
 if([a.pivot,a.axis,a.movingDirection].some(v=>validateVec3(v,'关节').length)||!Number.isFinite(a.angle)||Math.abs(a.angle)>90||Math.abs(a.angle)<.01||!Number.isFinite(a.blendWidth)||a.blendWidth<.005||a.blendWidth>.5)throw Error('关节参数无效：角度须在±90°内，过渡宽度0.005–0.5米');
 const axis=new Vector3(...a.axis),direction=new Vector3(...a.movingDirection);if(axis.length()<1e-6||direction.length()<1e-6||Math.abs(axis.clone().normalize().dot(direction.clone().normalize()))>.2)throw Error('旋转轴与活动侧方向应近似垂直');axis.normalize();direction.normalize();
 if(new Set(a.followNodeIds).size!==a.followNodeIds.length||a.followNodeIds.length>32||a.followNodeIds.includes(a.nodeId)||a.followNodeIds.some(id=>!doc.nodes.some(n=>n.id===id&&(n.assemblyId??n.id)===a.assemblyId)))throw Error('下游随动节点必须属于同一组件且不能重复');
 const source=node.geometry.params as {positions:number[];indices:number[];normals?:number[];[key:string]:unknown};if(!Array.isArray(source.positions)||source.positions.length>600000||source.positions.length%3)throw Error('网格顶点无效或超出20万顶点预算');
 const matrix=new Matrix4().compose(new Vector3(...node.transform.position),new Quaternion(...node.transform.rotationQuaternion),new Vector3(...node.transform.scale));if(Math.abs(matrix.determinant())<1e-10)throw Error('节点变换不可逆');const inverse=matrix.clone().invert(),pivot=new Vector3(...a.pivot),world:Vector3[]=[],moved:Vector3[]=[],positions:number[]=[];let fixed=0,full=0,transition=0;
 for(let i=0;i<source.positions.length;i+=3){const p=new Vector3(...source.positions.slice(i,i+3)).applyMatrix4(matrix);const t=Math.max(0,Math.min(1,.5+p.clone().sub(pivot).dot(direction)/a.blendWidth));const weight=t*t*(3-2*t);if(weight===0)fixed++;else if(weight===1)full++;else transition++;const q=new Quaternion().setFromAxisAngle(axis,a.angle*Math.PI/180*weight),v=p.clone().sub(pivot).applyQuaternion(q).add(pivot);world.push(p);moved.push(v);positions.push(...(weight===0?source.positions.slice(i,i+3):v.clone().applyMatrix4(inverse).toArray()));}
 if(!fixed||!full||!transition)throw Error('关节标定无效：必须同时覆盖固定端、平滑过渡和活动端，不能凭空猜测弯曲中心');
 const indices=source.indices??Array.from({length:world.length},(_,i)=>i);let maxStretch=1,minStretch=1;
 for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3);for(let j=0;j<3;j++){const u=tri[j],v=tri[(j+1)%3];if(!world[u]||!world[v])throw Error('网格索引无效');const old=world[u].distanceTo(world[v]);if(old<1e-7)continue;const ratio=moved[u].distanceTo(moved[v])/old;maxStretch=Math.max(maxStretch,ratio);minStretch=Math.min(minStretch,ratio);}const [u,v,w]=tri;const oldArea=new Vector3().crossVectors(world[v].clone().sub(world[u]),world[w].clone().sub(world[u])).length(),newArea=new Vector3().crossVectors(moved[v].clone().sub(moved[u]),moved[w].clone().sub(moved[u])).length();if(oldArea>1e-10&&newArea/oldArea<.25)throw Error('弯曲导致面片过度压扁，已拒绝；请调整标定或减小角度');}
 if(maxStretch>1.6||minStretch<.5)throw Error('弯曲导致局部拉伸/压缩过大，已拒绝；请调整过渡宽度或减小角度');
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));if(source.indices)g.setIndex(source.indices);g.computeVertexNormals();const geometry:Geometry={type:'mesh',params:{...structuredClone(source),positions,normals:Array.from(g.getAttribute('normal').array)}};g.dispose();const errors=validateGeometry(geometry);if(errors.length)throw Error(errors.map(e=>e.message).join('；'));
 const commands:Command[]=[{op:'updateParameters',targetId:node.id,geometry},...(a.followNodeIds.length?existingPoseCommands(doc,a.assemblyId,[{nodeIds:a.followNodeIds,pivot:a.pivot,axis:a.axis,angle:a.angle}]):[])];
 // Expected geometry is calculated internally, never accepted from model arguments.
 const preservationBaseline=structuredClone(doc);preservationBaseline.nodes.find(n=>n.id===node.id)!.geometry=geometry;
 return {commands,preservationBaseline,metrics:{vertices:world.length,fixed,transition,moving:full,maxEdgeStretch:maxStretch,minEdgeStretch:minStretch},limitations:'保留原顶点数量、索引、UV、部件ID和材质；仅做已标定关节的平滑旋转。不保证体积守恒，不含自动骨骼、碰撞求解或视觉验收。已有poseRig几何签名会失效，需要重新标定。'};
}
