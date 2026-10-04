import {Vector3,CatmullRomCurve3,TubeGeometry} from 'three';
import {buildHandPose,type HandPose} from '../scene/handPose';
import type {Vec3,Geometry} from './types';
export interface ArmInteraction {shoulder:Vec3;elbowHint:Vec3;upperLength:number;forearmLength:number;target:Vec3;operation:'press'|'grasp'|'support'|'reach';hand:Omit<HandPose,'wrist'>;sleeveRadius?:number;contactNormal?:Vec3}
/** Exact two-link reach calculation. Rejects unreachable targets instead of stretching limbs. */
export function solveTwoLink(shoulder:Vec3,target:Vec3,hint:Vec3,upper:number,lower:number){
 if([shoulder,target,hint].some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)))||![upper,lower].every(n=>Number.isFinite(n)&&n>.03&&n<2))throw Error('关节坐标或肢段长度无效');
 const root=new Vector3(...shoulder),end=new Vector3(...target),delta=end.clone().sub(root),distance=delta.length();if(distance<Math.abs(upper-lower)+.0001||distance>upper+lower-.0001)throw Error('操作目标超出当前手臂可达范围；请调整站位、目标或真实肢段尺寸，不能拉长肢体');
 const axis=delta.normalize(),along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 const bend=new Vector3(...hint).sub(root);bend.addScaledVector(axis,-bend.dot(axis));if(bend.length()<1e-5)throw Error('肘部参考方向与手臂平行，请提供明确弯曲方向');bend.normalize();
 const elbow=root.clone().addScaledVector(axis,along).addScaledVector(bend,height);
 return {shoulder,elbow:elbow.toArray() as Vec3,wrist:target,upperLength:upper,forearmLength:lower};
}
export function buildArmInteraction(a:ArmInteraction){
 const h0=buildHandPose({...a.hand,wrist:[0,0,0]});
 if(!['press','grasp','support','reach'].includes(a.operation))throw Error('操作类型无效');
 if(a.operation==='press'&&a.hand.pose!=='point')throw Error('按压操作需要point手型');
 if(a.operation==='grasp'&&!['power','pinch'].includes(a.hand.pose))throw Error('握持操作需要power或pinch手型');
 const anchor=a.operation==='reach'?[0,0,0] as Vec3:a.operation==='press'?h0.indexTip:a.operation==='grasp'?h0.gripCenter:h0.palmSurface;
 if(a.operation==='support'){
  if(a.hand.pose!=='support')throw Error('支撑操作需要support平展手型');
  if(!a.contactNormal||a.contactNormal.length!==3||a.contactNormal.some(x=>!Number.isFinite(x)))throw Error('支撑操作需要物体接触面的真实外法向contactNormal');
  const normal=new Vector3(...a.contactNormal);if(normal.length()<1e-6)throw Error('支撑接触法向不能为零');
  if(normal.normalize().dot(new Vector3(...h0.palmNormal))>-.95)throw Error('掌面必须朝向物体接触面，不能穿入或背向支撑');
 }
 const wrist=new Vector3(...a.target).sub(new Vector3(...anchor)).toArray() as Vec3;
 const chain=solveTwoLink(a.shoulder,wrist,a.elbowHint,a.upperLength,a.forearmLength),hand=buildHandPose({...a.hand,wrist});
 const r=a.sleeveRadius??.06;if(!Number.isFinite(r)||r<.015||r>.2)throw Error('衣袖半径无效');
 // A continuous swept surface rounds the elbow instead of intersecting separate cylinders.
 const sh=new Vector3(...a.shoulder),el=new Vector3(...chain.elbow),wr=new Vector3(...wrist),curve=new CatmullRomCurve3([sh,sh.clone().lerp(el,.82),el,el.clone().lerp(wr,.18),wr],false,'centripetal');
 const tube=new TubeGeometry(curve,36,r,16,false);const p=tube.getAttribute('position');
 for(let ring=0;ring<=36;ring++){const t=ring/36,c=curve.getPointAt(t),radius=r*(1-.35*t);for(let side=0;side<=16;side++){const idx=ring*17+side,v=new Vector3().fromBufferAttribute(p,idx).sub(c).multiplyScalar(radius/r).add(c);p.setXYZ(idx,v.x,v.y,v.z);}}
 tube.computeVertexNormals();const sleeve:Geometry={type:'mesh',params:{positions:Array.from(p.array),normals:Array.from(tube.getAttribute('normal').array),uvs:Array.from(tube.getAttribute('uv').array),indices:Array.from(tube.index!.array)}};tube.dispose();
 return {chain,hand,sleeve,target:a.target,operation:a.operation,accepted:false as const,limitations:'联动仅解算肩肘腕与手部目标；无全身平衡、真实骨骼或碰撞求解。必须检查衣袖、握持与邻物穿插。'};
}

/** Both arms must be feasible before either result is committed. Object stays fixed. */
export function buildBimanualInteraction(arms:ArmInteraction[]){
 if(arms.length!==2||new Set(arms.map(a=>a.hand.handedness)).size!==2)throw Error('双手操作需要一左一右两条手臂');
 if(arms.some(a=>!['support','grasp'].includes(a.operation)))throw Error('双手搬运只允许明确握持或承托接触');
 if(new Vector3(...arms[0].target).distanceTo(new Vector3(...arms[1].target))<.06)throw Error('双手接触点过近，必须分别定位物体两侧真实操作面');
 const results=arms.map(buildArmInteraction);
 return {arms:results,accepted:false as const,limitations:'仅求解双手静态接触和肩肘腕可达性；不自动移动物体，不计算重心、负载、步态或全身碰撞，须检查完整场景。'};
}
