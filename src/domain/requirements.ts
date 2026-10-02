import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {boundsFor} from './sceneQuality';
import type {SceneDocument} from './types';
export interface Requirement {quote:string;target:string;kind:'count'|'height'|'width'|'depth'|'color'|'other';expected:string}
export interface RequirementResult extends Requirement {status:'pass'|'mismatch'|'unknown';actual:string}
export interface RequirementReport {revision:number;items:RequirementResult[]}
// This verifies structured scene facts, not semantic completeness, realism or engineering safety.
export function checkRequirements(doc:SceneDocument,requirements:Requirement[]):RequirementReport{
 const groups=new Map<string,{name:string;bounds:Box3;colors:Set<string>}>();
 for(const n of doc.nodes){if(!n.visible||!n.geometry)continue;const id=n.assemblyId??n.id;let g=groups.get(id);if(!g){g={name:n.assemblyName??n.name,bounds:new Box3(),colors:new Set()};groups.set(id,g);}g.bounds.union(boundsFor(n.geometry).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))));const material=doc.materials.find(m=>m.id===n.materialId);if(material)g.colors.add(material.baseColor.toLowerCase());}
 const items=requirements.map((r):RequirementResult=>{
  const targets=[...groups.values()].filter(g=>g.name.includes(r.target));
  const result=(status:RequirementResult['status'],actual:string)=>({...r,status,actual});
  if(r.kind==='other')return result('unknown','需人工或视觉核对');
  if(!targets.length)return result('unknown','没有找到同名完整组件，不能据此认定缺失；需核对命名或分组');
  if(r.kind==='count'){const expected=Number(r.expected);if(!Number.isInteger(expected)||expected<0)return result('unknown','期望数量需为非负整数');return result(targets.length===expected?'pass':'mismatch',`按组件名称匹配到 ${targets.length} 个`);}
  if(r.kind==='color')return result('unknown',`匹配组件的材质色：${[...new Set(targets.flatMap(g=>[...g.colors]))].slice(0,12).join('、')}；配色部位与观感需核对`);
  const expected=Number(r.expected);if(!Number.isFinite(expected)||expected<=0)return result('unknown','尺寸需以米为单位填写正数');
  const axis={height:'y',width:'x',depth:'z'}[r.kind] as 'x'|'y'|'z';
  const values=targets.map(g=>g.bounds.getSize(new Vector3())[axis]);
  return result(values.every(v=>Math.abs(v-expected)<=Math.max(.01,expected*.02))?'pass':'mismatch',`世界坐标包围盒 ${axis.toUpperCase()}：${values.slice(0,12).map(v=>v.toFixed(2)).join('、')} 米${values.length>12?'等':''}（容差2%或1厘米取较大值）`);
 });return {revision:doc.revision,items};
}
function numeral(text:string):number{
 if(/^[0-9.]+$/.test(text))return Number(text);
 const digit:Record<string,number>={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
 if(text.includes('点')){const [whole,fraction]=text.split('点');return numeral(whole)+Number('0.'+[...fraction].map(c=>digit[c]??c).join(''));}
 let total=0,current=0;for(const c of text){if(c in digit)current=digit[c];else {total+=(current||1)*({'十':10,'百':100,'千':1000}[c]??NaN);current=0;}}return total+current;
}
function quotedNumbers(r:Requirement):number[]{
 const n='([0-9零〇一二两三四五六七八九十百千]+(?:[.点][0-9零〇一二两三四五六七八九]+)?)';
 const expression=r.kind==='count'?new RegExp(n+'\\s*(?:个|台|组|套|座|架|排|列)','g'):new RegExp(n+'\\s*(毫米|厘米|米|mm|cm|m)','gi');
 const matches=[...r.quote.matchAll(expression)];
 if(matches.length)return matches.map(m=>numeral(m[1])*(r.kind==='count'?1:['毫米','mm'].includes(m[2])?.001:['厘米','cm'].includes(m[2])?.01:1));
 return [...r.quote.matchAll(new RegExp(n,'g'))].map(m=>numeral(m[1]));
}
export function mergeRequirements(previous:Requirement[],incoming:Requirement[],userTexts:string[]):Requirement[]{
 const source=userTexts.join('\n');
 for(const r of incoming){if(!r.quote.trim()||!source.includes(r.quote)||!r.target.trim()||!source.includes(r.target))throw new Error('需求原文和目标名称必须来自用户实际指令，不能用模型假设代替');if(['count','height','width','depth'].includes(r.kind)&&!quotedNumbers(r).some(n=>Math.abs(n-Number(r.expected))<1e-8))throw new Error('期望数值必须对应引用原文的数字（尺寸换算为米）；不确定时用other标为待核对');}
 const result=[...previous];for(const r of incoming){const i=result.findIndex(old=>old.target===r.target&&old.kind===r.kind);if(i<0)result.push(r);else result[i]=r;}return result;
}
