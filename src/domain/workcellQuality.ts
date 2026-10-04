import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument,Vec3} from './types';
import {boundsFor} from './sceneQuality';
import {inspectClearance} from './clearance';
export interface WorkcellDeclaration {stationId:string;purpose:string;operators:string[];materials:string[];requiresOperator:boolean;requiresMaterials:boolean;maxOperatorGap:number;access?:{min:Vec3;max:Vec3}}
/** Requirements are declared per task; autonomous cells and intentionally empty storage remain valid. */
export function inspectWorkcells(doc:SceneDocument,cells:WorkcellDeclaration[]){
 if(!Array.isArray(cells)||!cells.length||cells.length>40)throw Error('需要1至40个作业单元');
 const groups=new Map<string,{bounds:Box3;roles:Set<string>}>();for(const n of doc.nodes){if(!n.visible||!n.geometry)continue;const id=n.assemblyId??n.id,g=groups.get(id)??{bounds:new Box3(),roles:new Set<string>()};g.roles.add(n.sceneRole??'other');g.bounds.union(boundsFor(n.geometry).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))));groups.set(id,g);}
 return cells.map(c=>{
  if(!c.purpose?.trim()||c.purpose.length>160||!Number.isFinite(c.maxOperatorGap)||c.maxOperatorGap<=0||c.maxOperatorGap>10||!Array.isArray(c.operators)||!Array.isArray(c.materials)||c.operators.length>16||c.materials.length>32)throw Error('作业关系参数无效');
  const station=groups.get(c.stationId);if(!station)throw Error('工位不存在');if([...c.operators,...c.materials].some(id=>!groups.has(id)||id===c.stationId))throw Error('人员或物料必须引用真实独立组件');
  const issues:string[]=[];if(c.requiresOperator&&!c.operators.length)issues.push('声明需要操作人员，但未关联');if(c.requiresMaterials&&!c.materials.length)issues.push('声明需要物料，但未关联');
  const operators=c.operators.map(id=>{const g=groups.get(id)!;if(!g.roles.has('person'))issues.push('操作人员关联到了非人员组件：'+id);const gap=Math.hypot(Math.max(0,g.bounds.min.x-station.bounds.max.x,station.bounds.min.x-g.bounds.max.x),Math.max(0,g.bounds.min.z-station.bounds.max.z,station.bounds.min.z-g.bounds.max.z));if(gap>c.maxOperatorGap)issues.push('人员离工位较远：'+id);return{id,horizontalGap:gap}});
  const access=c.access?inspectClearance(doc,c.access.min,c.access.max,[]):null;
  if(access?.totalHits)issues.push('声明的操作净空内存在包围盒占位候选');
  return {stationId:c.stationId,purpose:c.purpose,operators,materials:c.materials,access,issues,accepted:false,limitations:'按明确声明检查关联、水平距离与净空候选；不推断物料身份、路线连通、人体可达或工艺正确。空货架是否合理由实际需求决定。'};
 });
}
