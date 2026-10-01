import type { Geometry, Quaternion, SceneNode, Vec3 } from './types';
import { makeId } from '../util/ids';

export const EQUIPMENT_IDS = ['smt_mounter', 'pcb_conveyor'] as const;
export type EquipmentId = typeof EQUIPMENT_IDS[number];
// Generic editable equipment, not a manufacturer-certified reconstruction.
export function buildEquipment(templateId:string, parameters:Record<string,number>={}, position:Vec3=[0,0,0], yaw=0, name?:string):SceneNode[] {
  if(!EQUIPMENT_IDS.includes(templateId as EquipmentId))throw new Error('未知设备组件');
  if(Object.keys(parameters).some(k=>!['width','height','depth','feeders'].includes(k)))throw new Error('设备参数仅支持 width/height/depth/feeders');
  const conveyor=templateId==='pcb_conveyor';
  const w=parameters.width??(conveyor?1:1.6),h=parameters.height??(conveyor?.9:1.65),d=parameters.depth??(conveyor?.65:1.5),f=parameters.feeders??12;
  if(![w,h,d,f,...position,yaw].every(Number.isFinite)||position.length!==3||w<.6||w>4||h<.6||h>2.5||d<.4||d>3||!Number.isInteger(f)||f<4||f>24)throw new Error('设备尺寸超范围：宽0.6–4、高0.6–2.5、深0.4–3米；供料器4–24');
  const nodes:SceneNode[]=[];const assemblyId=makeId(),label=name?.trim()||(conveyor?'PCB 接驳输送机':'SMT 贴片机');
  const angle=yaw*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),q:Quaternion=[0,Math.sin(angle/2),0,Math.cos(angle/2)];
  function part(title:string,g:Geometry,p:Vec3,mat='mat_white',rotation?:Quaternion){
    const r=rotation??[0,0,0,1];const rotationQuaternion:Quaternion=[q[3]*r[0]+q[1]*r[2],q[3]*r[1]+q[1]*r[3],q[3]*r[2]-q[1]*r[0],q[3]*r[3]-q[1]*r[1]];
    nodes.push({id:nodes.length?makeId():assemblyId,assemblyId,parentId:null,name:`${label} · ${title}`,kind:'primitive',geometry:g,materialId:mat,visible:true,transform:{position:[position[0]+p[0]*cs+p[2]*sn,position[1]+p[1],position[2]-p[0]*sn+p[2]*cs],rotationQuaternion,scale:[1,1,1]}});
  }
  const box=(n:string,x:number,y:number,z:number,bw:number,bh:number,bd:number,m='mat_white',bevel=.003)=>part(n,{type:'box',params:{width:bw,height:bh,depth:bd,bevelRadius:Math.min(bevel,bw/4,bh/4,bd/4)}},[x,y,z],m);
  const cyl=(n:string,x:number,y:number,z:number,r:number,len:number,m:string,front=false)=>part(n,{type:'cylinder',params:{radiusTop:r,radiusBottom:r,height:len,radialSegments:32}},[x,y,z],m,front?[Math.SQRT1_2,0,0,Math.SQRT1_2]:undefined);
  const railY=conveyor?h:.55*h;
  for(const x of [-w*.4,w*.4])for(const z of [-d*.37,d*.37]){
    cyl('调平脚垫',x,.028,z,.045,.055,'mat_rubber');cyl('螺纹支脚',x,.075,z,.018,.06,'mat_metal');
    if(conveyor)box('铝型材支腿',x,(h-.13)/2+.10,z,.045,h-.13,.045,'mat_metal');
  }
  if(conveyor){
    for(const z of [-d*.36,d*.36]){box('输送导轨',0,h,z,w,.07,.045,'mat_metal');box('防静电窄皮带',0,h+.014,z*.91,w-.025,.014,.035,'mat_rubber');box('下部横撑',0,.23,z,w-.08,.035,.035,'mat_metal');}
    box('电控箱',w*.3,h*.55,0,w*.25,h*.36,d*.52,'mat_white');
    box('PCB 样板',0,h+.03,0,w*.36,.008,d*.61,'mat_pcb');
    box('宽度调节横轴',0,h-.09,0,.025,.025,d*.83,'mat_metal');
    cyl('调节手轮',0,h-.09,d*.48,.052,.024,'mat_black',true);
    box('传感器',w*.33,h+.05,d*.28,.035,.035,.025,'mat_black');
    return nodes;
  }
  box('内凹底座',0,.14,0,w*.88,.10,d*.84,'mat_dark');
  box('下机架',0,h*.27,0,w*.95,h*.40,d*.92,'mat_dark',.008);
  // Panels leave real seams, rather than drawing black lines on a solid cube.
  for(const x of [-w*.247,w*.247]){
    box('独立检修门',x,h*.29,d*.468,w*.474,h*.34,.022,'mat_white');
    box('门把手',x+w*.15,h*.36,d*.49,.018,h*.075,.024,'mat_metal');
  }
  box('背部检修板',0,h*.30,-d*.468,w*.93,h*.34,.025,'mat_white');
  for(const side of [-1,1]){
    box('侧面下护板',side*w*.485,h*.29,0,.025,h*.34,d*.92);
    box('输送口下沿',side*w*.485,railY-.055,0,.03,.055,d*.90);
    box('输送口上护板',side*w*.485,h*.76,0,.025,h*.38,d*.90);
    box('输送口前立柱',side*w*.485,railY+.035,d*.39,.03,.12,d*.12);
    box('输送口后立柱',side*w*.485,railY+.035,-d*.39,.03,.12,d*.12);
  }
  box('上腔后壁',0,h*.77,-d*.465,w*.95,h*.4,.03);
  box('顶部钣金罩',0,h*.98,0,w,.04,d*.97,'mat_white',.007);
  box('观察窗上眉',0,h*.925,d*.467,w*.94,h*.07,.035,'mat_white');
  for(const x of [-w*.465,0,w*.465])box('观察窗立框',x,h*.755,d*.47,.025,h*.29,.035,'mat_dark');
  for(const x of [-w*.23,w*.23]){
    box('烟色观察窗',x,h*.755,d*.474,w*.435,h*.275,.008,'mat_glass',.001);
    box('窗下把手',x,h*.61,d*.49,w*.16,.018,.027,'mat_metal');
  }
  box('观察窗下边框',0,h*.60,d*.47,w*.95,.028,.034,'mat_dark');
  // Visible internal mechanics behind glazing.
  box('内部工作台',0,railY-.07,0,w*.87,.05,d*.68,'mat_metal');
  for(const z of [-d*.13,d*.13])box('PCB 输送导轨',0,railY,z,w+.14,.045,.025,'mat_metal');
  box('PCB 工件',0,railY+.028,0,w*.27,.009,d*.22,'mat_pcb');
  box('龙门横梁',0,h*.80,0,w*.84,.075,.08,'mat_metal');
  for(const x of [-w*.38,w*.38])box('龙门纵向导轨',x,h*.78,-d*.04,.05,.05,d*.67,'mat_metal');
  box('贴装头滑座',w*.10,h*.76,0,w*.13,h*.10,d*.10,'mat_dark');
  for(let i=0;i<4;i++)cyl('吸嘴',w*.10+(i-1.5)*.025,h*.675,.02,.007,h*.045,'mat_metal');
  box('供料器托架',0,h*.51,d*.56,w*.83,.04,d*.20,'mat_dark');
  for(let i=0;i<f;i++){
    const x=(i-(f-1)/2)*(w*.76/f);
    box('供料轨 '+(i+1),x,h*.55,d*.49,w*.58/f,.032,d*.31,'mat_metal',.001);
    box('料盘支架 '+(i+1),x,h*.46,d*.54,.018,h*.12,.028,'mat_dark',.002);
    cyl('料盘安装轴 '+(i+1),x,h*.405,d*.62,.009,d*.15,'mat_metal',true);
    cyl('料盘 '+(i+1),x,h*.405,d*.69,Math.min(w*.34/f,h*.052),.016,i%3===0?'mat_dark':'mat_metal',true);
    cyl('料盘轴 '+(i+1),x,h*.405,d*.704,.011,.02,'mat_black',true);
  }
  // HMI on a distinct mounting arm, screen content uses geometry (no image assets).
  box('屏幕支臂',w*.47,h*.64,d*.57,.045,h*.28,.045,'mat_metal');
  box('HMI 外框',w*.43,h*.84,d*.64,w*.24,h*.19,.045,'mat_dark',.008);
  box('HMI 显示屏',w*.43,h*.84,d*.666,w*.205,h*.153,.006,'mat_screen',.002);
  for(let i=0;i<3;i++)box('屏幕状态行',w*.42,h*(.89-i*.025),d*.671,w*.15,.009,.002,i===0?'mat_cyan':'mat_metal',.0003);
  box('操作台',w*.43,h*.70,d*.66,w*.24,.035,.11,'mat_white');
  cyl('急停底座',w*.51,h*.74,d*.67,.025,.025,'mat_yellow');cyl('急停蘑菇头',w*.51,h*.765,d*.67,.019,.024,'mat_red');
  cyl('状态灯立杆',-w*.38,h+.07,-d*.32,.012,.12,'mat_metal');
  ['mat_green','mat_yellow','mat_red'].forEach((m,i)=>cyl('三色塔灯',-w*.38,h+.145+i*.038,-d*.32,.024,.032,m));
  for(let i=0;i<7;i++)box('背部散热百叶',w*.23,h*.27+i*.018,-d*.486,w*.30,.006,.008,'mat_dark',.001);
  return nodes;
}
