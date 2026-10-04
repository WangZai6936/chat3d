import {BufferGeometry,CapsuleGeometry,Matrix4,Quaternion,SphereGeometry,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Geometry,Vec3} from '../domain/types';
export const HAND_POSES=['relaxed','point','power','pinch','support'] as const;
export interface HandPose {wrist:Vec3;forward:Vec3;dorsal:Vec3;handedness:'left'|'right';pose:typeof HAND_POSES[number];scale?:number;gripDiameter?:number}
/** Generic, editable five-digit hand. Coordinates in metres; forward runs wrist to fingers. */
export function buildHandPose(a:HandPose){
 const scale=a.scale??1,diameter=a.gripDiameter??.035;
 if(!HAND_POSES.includes(a.pose)||!['left','right'].includes(a.handedness)||!Number.isFinite(scale)||scale<.3||scale>3||!Number.isFinite(diameter)||diameter<.012||diameter>.08||[a.wrist,a.forward,a.dorsal].some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>10000)))throw Error('手部姿态参数无效');
 const f=new Vector3(...a.forward),up=new Vector3(...a.dorsal);if(f.length()<1e-6||up.length()<1e-6)throw Error('方向向量不能为零');f.normalize();up.addScaledVector(f,-up.dot(f));if(up.length()<1e-4)throw Error('手背方向不能与手指方向平行');up.normalize();
 const x=new Vector3().crossVectors(f,up).normalize(),z=f.clone().negate(),basis=new Matrix4().makeBasis(x,up,z);basis.setPosition(new Vector3(...a.wrist));
 const world=(p:number[])=>new Vector3(...p as Vec3).multiplyScalar(scale).applyMatrix4(basis).toArray() as Vec3;
 const pieces:BufferGeometry[]=[],joints:{digit:string;points:Vec3[]}[]=[];
 const ellipsoid=(p:Vec3,s:Vec3)=>{const g=new SphereGeometry(1,16,10);g.scale(...s);g.translate(...p);pieces.push(g);};
 const segment=(a:Vec3,b:Vec3,r:number)=>{const p=new Vector3(...a),q=new Vector3(...b),d=q.clone().sub(p);const g=new CapsuleGeometry(r,Math.max(.001,d.length()-2*r),4,10);g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));g.translate(...p.add(q).multiplyScalar(.5).toArray());pieces.push(g);};
 // Wrist, tapered palm and thenar pad overlap only at anatomical joints.
 ellipsoid([0,0,.004],[.025,.018,.024]);ellipsoid([0,0,-.043],[.039,.019,.055]);
 const side=a.handedness==='right'?1:-1;ellipsoid([side*.026,-.003,-.027],[.018,.018,.032]);
 const radius=diameter/2,center:[number,number,number]=[0,-radius-.013,-.09];
 const digits=['index','middle','ring','little'],lengths=[.071,.079,.073,.058];
 for(let i=0;i<4;i++){
  const px=side*(.027-i*.018),len=lengths[i],root:Vec3=[px,-.001,-.079],r=i===3?.007:.008;
  let pts:Vec3[];
  if(a.pose==='support')pts=[root,[px,0,-.079-len*.45],[px,0,-.079-len*.77],[px,0,-.079-len]];
  else if(a.pose==='relaxed'||(a.pose==='point'&&i===0))pts=[root,[px,-.004,-.079-len*.45],[px,-.009,-.079-len*.77],[px,-.015,-.079-len]];
  else if(a.pose==='pinch'&&i===0)pts=[root,[px,-.012,-.109],[px,-.032,-.122],[px,-.045,-.113]];
  else pts=[root,[px,center[1]+radius*.48,center[2]-radius-.008],[px,center[1]-radius*.68,center[2]-radius*.65],[px,center[1]-radius-.006,center[2]+radius*.3]];
  for(let k=0;k<pts.length-1;k++)segment(pts[k],pts[k+1],r*(1-k*.11));
  for(let k=1;k<pts.length-1;k++)ellipsoid(pts[k],[r*.92,r*.92,r*.92]);
  joints.push({digit:digits[i],points:pts.map(world)});
 }
 const thumb:Vec3[]=a.pose==='power'||a.pose==='pinch'?[[side*.029,-.004,-.018],[side*.055,-.012,-.042],[side*.05,-.038,-.067],[side*.025,-.048,-.087]]:[[side*.029,-.004,-.018],[side*.055,-.009,-.038],[side*.068,-.012,-.063]];
 for(let k=0;k<thumb.length-1;k++)segment(thumb[k],thumb[k+1],.010-k*.001);joints.push({digit:'thumb',points:thumb.map(world)});
 const merged=mergeGeometries(pieces,false)!;for(const g of pieces)g.dispose();merged.scale(scale,scale,scale);merged.applyMatrix4(basis);merged.computeVertexNormals();
 const geometry:Geometry={type:'mesh',params:{positions:Array.from(merged.getAttribute('position').array),normals:Array.from(merged.getAttribute('normal').array),uvs:Array.from(merged.getAttribute('uv').array),indices:Array.from(merged.index!.array)}};merged.dispose();
 return {geometry,joints,wrist:a.wrist,palmSurface:world([0,-.019,-.043]),palmNormal:up.clone().negate().toArray() as Vec3,gripCenter:world(center),gripAxis:x.toArray() as Vec3,indexTip:joints[0].points[joints[0].points.length-1],limitations:'手部为程序化姿态几何；需按实际握柄调整尺寸/朝向并检查近景，不是人体骨骼或碰撞求解器。'};
}
