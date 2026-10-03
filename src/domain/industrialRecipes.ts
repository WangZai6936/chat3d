import {Quaternion,Vector3} from 'three';
import type {AssemblyDefinition,AssemblyPart} from './assembly';
import type {Vec3} from './types';
export const RECIPE_NAMES=['operator','enclosure','rack','agv'] as const;
/** Optional editable parts, never an automatic substitute for a user's scene. */
export function industrialRecipe(kind:string):AssemblyDefinition{
 const parts:AssemblyPart[]=[];
 const part=(name:string,geometry:AssemblyPart['geometry'],position:Vec3,materialId:string,scale:Vec3=[1,1,1])=>{parts.push({name,geometry,materialId,transform:{position,scale,rotationQuaternion:[0,0,0,1]}});};
 const box=(n:string,p:Vec3,s:Vec3,m='mat_paint')=>part(n,{type:'box',params:{width:s[0],height:s[1],depth:s[2],bevelRadius:Math.min(.007,...s.map(v=>v/5))}},p,m);
 const limb=(n:string,a:Vec3,b:Vec3,r1:number,r2:number,m:string)=>{const v=new Vector3(...b).sub(new Vector3(...a));const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.clone().normalize());parts.push({name:n,materialId:m,geometry:{type:'cylinder',params:{radiusTop:r2,radiusBottom:r1,height:v.length(),radialSegments:16}},transform:{position:a.map((v,i)=>(v+b[i])/2) as Vec3,scale:[1,1,1],rotationQuaternion:q.toArray() as [number,number,number,number]}});};
 if(kind==='operator'){
  // Working adult: anatomical sections and connected bent arms, not a box torso.
  part('躯干轮廓',{type:'lathe',params:{points:[[.13,.88],[.165,.96],[.15,1.12],[.195,1.28],[.205,1.34],[.18,1.39],[.10,1.44],[.053,1.46]],segments:32}},[0,0,0],'mat_fabric',[1,1,.66]);
  part('骨盆',{type:'lathe',params:{points:[[.105,.79],[.15,.84],[.165,.94],[.14,1.00]],segments:24}},[0,0,0],'mat_dark',[1,1,.72]);
  part('头部',{type:'sphere',params:{radius:.12,widthSegments:32,heightSegments:24}},[0,1.61,0],'mat_skin',[.82,1.18,.94]);
  limb('颈部',[0,1.43,0],[0,1.51,0],.047,.045,'mat_skin');
  part('工作帽',{type:'lathe',params:{points:[[.105,0],[.118,.025],[.108,.065],[.065,.09],[0,.10]],segments:24}},[0,1.68,0],'mat_fabric',[.92,.72,1]);
  for(const side of [-1,1]){
   const x=side*.10;part('工作鞋',{type:'roundedPlate',params:{width:.13,height:.095,depth:.27,cornerRadius:.045}},[x,.0475,.045],'mat_rubber');
   limb('小腿',[x,.12,0],[x+side*.015,.48,.015],.048,.06,'mat_dark');limb('大腿',[x+side*.015,.48,.015],[x,.89,0],.064,.08,'mat_dark');
   const shoulder:Vec3=[side*.205,1.34,0],elbow:Vec3=[side*.25,1.09,.08],wrist:Vec3=[side*.19,1.02,.35];
   part('肩部',{type:'sphere',params:{radius:.071,widthSegments:24,heightSegments:16}},shoulder,'mat_fabric');part('肘部',{type:'sphere',params:{radius:.059,widthSegments:24,heightSegments:16}},elbow,'mat_fabric');limb('上臂',shoulder,elbow,.071,.057,'mat_fabric');limb('前臂',elbow,wrist,.059,.041,'mat_fabric');
   part('操作手',{type:'sphere',params:{radius:.045,widthSegments:24,heightSegments:16}},[wrist[0],wrist[1]-.005,wrist[2]+.035],'mat_skin',[.8,.65,1.4]);
  }
  box('胸牌',[-.075,1.29,.119],[.055,.075,.005],'mat_white');
  return {name:'操作人员',sceneRole:'person',parts};
 }
 if(kind==='enclosure'){
  box('底座',[0,.12,0],[1.5,.24,1.18],'mat_dark');
  for(const x of [-.72,.72])box('立柱',[x,.85,0],[.06,1.46,1.12],'mat_paint');
  box('顶罩',[0,1.60,0],[1.5,.06,1.18]);box('后封板',[0,.91,-.575],[1.36,1.32,.025]);
  box('工作平台',[0,.90,0],[1.34,.055,1.02],'mat_metal');
  for(const x of [-.347,.347]){box('下检修门',[x,.52,.575],[.68,.65,.022]);box('门把手',[x+.24,.61,.598],[.025,.14,.025],'mat_dark');}
  part('观察窗框',{type:'frame',params:{width:1.35,height:.57,depth:.03,thickness:.045}},[0,1.255,.575],'mat_blue');box('观察玻璃',[0,1.255,.577],[1.26,.48,.012],'mat_glass');
  box('内部运动横梁',[0,1.21,-.10],[1.22,.06,.07],'mat_metal');box('机头',[.18,1.12,-.10],[.17,.19,.17],'mat_dark');
  part('HMI斜切外壳',{type:'profile',params:{points:[[-.115,-.08],[.10,-.08],[.115,.06],[-.095,.10]],depth:.055}},[.51,.82,.65],'mat_dark');box('显示屏',[.51,.83,.68],[.17,.115,.006],'mat_screen');
  for(let i=0;i<5;i++)box('通风缝',[-.40,.32+i*.035,.589],[.32,.008,.006],'mat_dark');
  return {name:'通用加工设备',sceneRole:'equipment',parts};
 }
 if(kind==='rack'){
  for(const x of [-.93,.93])for(const z of [-.40,.40])box('立柱',[x,1, z],[.055,2,.055],'mat_blue');
  for(const y of [.12,.72,1.32,1.92]){box('层板',[0,y,0],[1.9,.03,.84],'mat_metal');for(const z of [-.42,.42])box('承重横梁',[0,y-.035,z],[1.9,.06,.045],'mat_blue');}
  return {name:'仓储货架',sceneRole:'storage',parts};
 }
 if(kind==='agv'){
  part('圆角车身',{type:'roundedPlate',params:{width:.85,depth:.62,height:.18,cornerRadius:.10}},[0,.20,0],'mat_paint');
  part('防撞围边',{type:'roundedPlate',params:{width:.88,depth:.65,height:.06,cornerRadius:.10}},[0,.11,0],'mat_rubber');
  box('载物平台',[0,.31,0],[.66,.035,.48],'mat_metal');
  for(const x of [-.25,.25])for(const z of [-.29,.29])limb('行走轮',[x,.095,z-.025],[x,.095,z+.025],.085,.085,'mat_rubber');
  part('导航雷达',{type:'cylinder',params:{radiusTop:.045,radiusBottom:.045,height:.045,radialSegments:24}},[.34,.315,0],'mat_black');
  box('状态灯',[.414,.21,0],[.006,.015,.19],'mat_green');return {name:'搬运AGV',sceneRole:'transport',parts};
 }
 throw new Error('未知参考组件');
}
