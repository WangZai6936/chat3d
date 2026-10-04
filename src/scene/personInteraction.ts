import {buildArmInteraction} from '../domain/interactionPose';
import {Matrix4,Quaternion,Vector3} from 'three';
import {buildHandPose} from './handPose';
import {buildPrimitiveGeometry} from './geometry';
import {boundsFor} from '../domain/sceneQuality';
import type {SceneNode,Geometry,Vec3} from '../domain/types';
import {makeId} from '../util/ids';
export type InteractionStyle='operate'|'inspect'|'scan'|'pack';
/** Reusable correction for our explicit legacy hand/sleeve asset contract, not scene-name routing. */
export function refinePersonInteraction(input:SceneNode[],style:InteractionStyle){
 const nodes=structuredClone(input);const hands=nodes.filter(n=>/ · hand(?:001)?$/.test(n.name));
 if(hands.length!==2)throw Error('需要明确的左右手资产结构，不能猜测任意网格');
 const removed=new Set(nodes.filter(n=>/ · fingers\d*$/.test(n.name)).map(n=>n.id));
 const newParts:SceneNode[]=[],anchors:{handId:string;gripCenter:Vec3;indexTip:Vec3}[]=[];
 const bounds=(n:SceneNode)=>boundsFor(n.geometry!).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale)));
 const mesh=(g:Geometry)=>{const b=buildPrimitiveGeometry(g);const result:Geometry={type:'mesh',params:{positions:Array.from(b.getAttribute('position').array),normals:Array.from(b.getAttribute('normal').array),uvs:Array.from(b.getAttribute('uv').array),indices:b.index?Array.from(b.index.array):Array.from({length:b.getAttribute('position').count},(_,i)=>i)}};b.dispose();return result;};
 for(const hand of hands){
  const right=hand.name.endsWith('001'),q=new Quaternion(...hand.transform.rotationQuaternion),forward=new Vector3(0,0,-1).applyQuaternion(q),up=new Vector3(0,1,0),side=new Vector3(1,0,0).applyQuaternion(q),center=bounds(hand).getCenter(new Vector3()),wrist=center.clone().addScaledVector(forward,-.052);
  const pose=right?(style==='operate'?'point':style==='inspect'?'pinch':'power'):(style==='inspect'?'pinch':'relaxed');
  const dorsal=right&&(style==='scan'||style==='pack')?side.clone().negate():up;
  const h=buildHandPose({wrist:wrist.toArray() as Vec3,forward:forward.toArray() as Vec3,dorsal:dorsal.toArray() as Vec3,handedness:right?'right':'left',pose,scale:.84,gripDiameter:style==='inspect'?(right?.035:.016):.032});
  const suffix=right?'001':'',shoulder=nodes.find(n=>n.name.endsWith(' · shoulder'+suffix)),sleeve=nodes.find(n=>n.name.endsWith(' · work sleeve'+suffix));
  if(shoulder&&sleeve){
   const sh=bounds(shoulder).getCenter(new Vector3()),free=!right&&style!=='inspect',press=right&&style==='operate';
   const linked=buildArmInteraction({shoulder:sh.toArray() as Vec3,elbowHint:sh.clone().add(new Vector3(0,-.3,0)).addScaledVector(forward,-.08).toArray() as Vec3,upperLength:.28,forearmLength:.27,target:free?wrist.toArray() as Vec3:press?h.indexTip:h.gripCenter,operation:free?'reach':press?'press':'grasp',hand:{forward:forward.toArray() as Vec3,dorsal:dorsal.toArray() as Vec3,handedness:right?'right':'left',pose,scale:.84,gripDiameter:style==='inspect'?(right?.035:.016):.032},sleeveRadius:.067});
   sleeve.geometry=linked.sleeve;sleeve.transform={position:[0,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]};delete sleeve.connection;
  }
  hand.geometry=h.geometry;hand.transform={position:[0,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]};delete hand.connection;
  anchors.push({handId:hand.id,gripCenter:h.gripCenter,indexTip:h.indexTip});
  if(!right){
   if(style==='inspect'){const caliper=nodes.find(n=>/ · caliper$/.test(n.name));if(caliper){const target=new Vector3(...h.gripCenter).addScaledVector(forward,.012).addScaledVector(up,-.012),offset=target.sub(bounds(caliper).getCenter(new Vector3()));caliper.transform.position=new Vector3(...caliper.transform.position).add(offset).toArray() as Vec3;delete caliper.connection;}}
   continue;
  }
  const grip=new Vector3(...h.gripCenter);
  const move=(n:SceneNode,p:Vector3)=>{const offset=p.clone().sub(bounds(n).getCenter(new Vector3()));n.transform.position=new Vector3(...n.transform.position).add(offset).toArray() as Vec3;delete n.connection;};
  const add=(name:string,geometry:Geometry,position:Vector3,materialId:string|undefined,rot:Quaternion=new Quaternion())=>{newParts.push({...hand,id:makeId(),name:(hand.assemblyName??'人物')+' · '+name,geometry:mesh(geometry),materialId,transform:{position:position.toArray() as Vec3,rotationQuaternion:rot.toArray() as [number,number,number,number],scale:[1,1,1]}})};
  if(style==='scan'||style==='pack'){
   const tool=nodes.find(n=>style==='scan'?/ · barcode scanner$/.test(n.name):/ · tape gun$/.test(n.name));if(!tool)throw Error('手持工具缺失');
   // Palm remains behind the handle; fingers curl around it, tool head stays above the hand.
   const axis=new Vector3(...h.gripAxis),handleRotation=new Quaternion().setFromUnitVectors(up,axis);
   add('grip handle',{type:'capsule',params:{radius:.014,length:.075}},grip,tool.materialId,handleRotation);
   const toolCenter=grip.clone().addScaledVector(up,style==='scan'?.09:.10).addScaledVector(forward,.035);
   move(tool,toolCenter);
   if(style==='scan'){
    const screen=nodes.find(n=>/ · scanner screen$/.test(n.name));if(screen)move(screen,toolCenter.clone().addScaledVector(up,.046).addScaledVector(forward,.035));
   }else{
    const reel=nodes.find(n=>/ · tape reel$/.test(n.name));if(reel)move(reel,toolCenter.clone().addScaledVector(up,.065));
   }
  }
  if(style==='inspect'){
   const tablet=nodes.find(n=>/ · inspection tablet$/.test(n.name)),screen=nodes.find(n=>/ · tablet screen$/.test(n.name));
   if(tablet){const target=grip.clone().addScaledVector(side,-.126).addScaledVector(up,.083).addScaledVector(forward,.012);move(tablet,target);if(screen)move(screen,target.clone().addScaledVector(forward,-.022));}
  }
 }
 return {nodes:[...nodes.filter(n=>!removed.has(n.id)),...newParts],anchors,removedIds:[...removed],accepted:false as const};
}
