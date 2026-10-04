import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {boundsFor} from './sceneQuality';
import type {SceneDocument} from './types';
export interface Requirement {quote:string;target:string;kind:'count'|'length'|'height'|'width'|'depth'|'color'|'other';expected:string;dimensionBasis?:'length-width'|'width-depth'|'uncertain'}
export interface RequirementResult extends Requirement {status:'pass'|'mismatch'|'unknown';actual:string}
export interface RequirementReport {revision:number;items:RequirementResult[]}
// This verifies structured scene facts, not semantic completeness, realism or engineering safety.
export function checkRequirements(doc:SceneDocument,requirements:Requirement[]):RequirementReport{
 const groups=new Map<string,{name:string;bounds:Box3;colors:Set<string>}>();
 for(const n of doc.nodes){if(!n.visible||!n.geometry)continue;const id=n.assemblyId??n.id;let g=groups.get(id);if(!g){g={name:n.assemblyName??n.name,bounds:new Box3(),colors:new Set()};groups.set(id,g);}g.bounds.union(boundsFor(n.geometry).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))));const material=doc.materials.find(m=>m.id===n.materialId);if(material)g.colors.add(material.baseColor.toLowerCase());}
 const items=requirements.map((r):RequirementResult=>{
  let targets=[...groups.values()].filter(g=>g.name.includes(r.target));
  let partMatch=false;
  if(!targets.length){
   // Named parts (e.g. 台面) remain addressable inside an assembly. Never count both.
   targets=doc.nodes.filter(n=>n.visible&&n.geometry&&n.name.includes(r.target)).map(n=>({name:n.name,bounds:boundsFor(n.geometry!).applyMatrix4(new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale))),colors:new Set(doc.materials.filter(m=>m.id===n.materialId).map(m=>m.baseColor.toLowerCase()))}));
   partMatch=targets.length>0;
  }
  const result=(status:RequirementResult['status'],actual:string)=>({...r,status,actual});
  if(r.kind==='other')return result('unknown','需人工或视觉核对');
  if(!targets.length)return result('unknown','没有找到同名组件或零件，不能据此认定缺失；需核对命名或分组');
  if(r.kind==='count'){const expected=Number(r.expected);if(!Number.isInteger(expected)||expected<0)return result('unknown','期望数量需为非负整数');
   const ambiguous=targets.filter(g=>{const name=g.name.trim(),at=name.indexOf(r.target),suffix=name.slice(at+r.target.length).trim();const entity=/^(?:工位|设备|本体|单元|模型|组件|对象)(?:[-_#\s]*[A-Za-z0-9一二三四五六七八九十]+)?$/.test(suffix);return !!suffix&&!entity&&!/^(?:[-_#\s]*(?:[A-Z]{1,3}\d*|[0-9一二三四五六七八九十]+)|[（(][A-Z0-9一二三四五六七八九十]+[）)])$/.test(suffix);});
   if(ambiguous.length)return result('unknown',`名称包含目标的${partMatch?'零件':'组件'}共${targets.length}个，其中${ambiguous.length}个可能是配套或复合名称（${ambiguous.slice(0,3).map(g=>g.name).join('、')}）。不能据此判定数量不符；请核对真实组件身份，不要为匹配统计而改名或改分类`);
   return result(targets.length===expected?'pass':'mismatch',`按${partMatch?'零件':'组件'}名称匹配到 ${targets.length} 个`);}
  if(r.kind==='color')return result('unknown',`匹配${partMatch?'零件':'组件'}的材质色：${[...new Set(targets.flatMap(g=>[...g.colors]))].slice(0,12).join('、')}；配色部位与观感需核对`);
  const expected=Number(r.expected);if(!Number.isFinite(expected)||expected<=0)return result('unknown','尺寸需以米为单位填写正数');
  const natural=r.dimensionBasis?r.dimensionBasis==='length-width':requirements.some(item=>item.target===r.target&&item.kind==='length')||quotedNumbers({...r,kind:'length'}).length>0;
  if(r.dimensionBasis==='uncertain'||/[XYZ]\s*轴|沿\s*[XYZ]|旋转|转向|朝向|长宽互换/i.test(r.quote))return result('unknown','尺寸方向或轴约定不明确，需人工确认；没有按其他维度数值代替');
  const axis={length:'x',height:'y',width:natural?'z':'x',depth:'z'}[r.kind] as 'x'|'y'|'z';
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
// Expand only contiguous, explicitly labelled dimensions with a shared trailing unit.
// No propagation across sentences or unrelated counts; preserve the original evidence quote.
function dimensionQuote(quote:string):string{
 const label='(?:总长|长度?|总宽|宽度?|总高|高度?|深度?|纵深|length|width|height|depth)';
 const number='[0-9零〇一二两三四五六七八九十百千]+(?:[.点][0-9零〇一二两三四五六七八九]+)?';
 const unit='(?:毫米|厘米|mm|cm|米|m)';
 const field=label+'\\s*(?:约为|大约|约|为|是|:|：|=)?\\s*'+number;
 const chain=new RegExp(field+'\\s*'+unit+'?(?:\\s*[、，,]\\s*'+field+'\\s*'+unit+'?){1,5}','gi');
 return quote.replace(chain,block=>{const trailing=block.match(new RegExp('('+unit+')\\s*$','i'));if(!trailing)return block;return block.replace(new RegExp('('+field+')\\s*('+unit+')?','gi'),(_all,value,u)=>value+(u??trailing[1]));});
}
function quotedNumbers(r:Requirement):number[]{
 const n='([0-9零〇一二两三四五六七八九十百千]+(?:[.点][0-9零〇一二两三四五六七八九]+)?)';
 if(r.kind!=='count'){
  const label={length:'(?:总长|长度?|length)',height:'(?:总高|高度?|height)',width:'(?:总宽|宽度?|width)',depth:'(?:深度?|纵深|depth)'}[r.kind as 'length'|'height'|'width'|'depth'];
  if(!label)return [];
  const unit='(毫米|厘米|mm|cm|米|m)';
  const quote=dimensionQuote(r.quote);
  const expressions=[new RegExp(label+'\\s*(?:约为|大约|约|为|是|:|：|=)?\\s*'+n+'\\s*'+unit,'gi'),new RegExp(n+'\\s*'+unit+'\\s*'+label+'(?!\\s*(?:约为|大约|约|为|是|:|：|=)?\\s*[0-9零〇一二两三四五六七八九十百千])','gi')];
  return expressions.flatMap(expression=>[...quote.matchAll(expression)].map(m=>numeral(m[1])*(['毫米','mm'].includes(m[2].toLowerCase())?.001:['厘米','cm'].includes(m[2].toLowerCase())?.01:1)));
 }
 const expression=new RegExp(n+'\\s*(?:个|台|组|套|座|架|排|列|条|根|张)','g');
 const matches=[...r.quote.matchAll(expression)];
 if(matches.length)return matches.map(m=>numeral(m[1]));
 return [...r.quote.matchAll(new RegExp(n,'g'))].map(m=>numeral(m[1]));
}
export function mergeRequirements(previous:Requirement[],incoming:Requirement[],userTexts:string[]):Requirement[]{
 const source=userTexts.join('\n');
 for(const r of incoming){if(!r.quote.trim()||!source.includes(r.quote)||!r.target.trim()||!source.includes(r.target))throw new Error('需求原文和目标名称必须来自用户实际指令，不能用模型假设代替');if(['count','length','height','width','depth'].includes(r.kind)&&!quotedNumbers(r).some(n=>Math.abs(n-Number(r.expected))<1e-8))throw new Error(`期望数值必须对应引用原文的同一维度或数量（尺寸换算为米）：${r.target}/${r.kind}=${r.expected}；该维度解析值为[${quotedNumbers(r).join(',')}]。不确定时用other标为待核对`);}
 const result=[...previous];for(const original of incoming){
  const r={...original};
  if(['length','width','depth','height'].includes(r.kind)){
   const context=[...userTexts].reverse().flatMap(text=>text.split(/[。；;\n]/)).find(text=>text.includes(r.target)&&text.includes(r.quote))??r.quote;
   const hasLength=quotedNumbers({...r,quote:context,kind:'length'}).length>0;
   const hasDepth=quotedNumbers({...r,quote:context,kind:'depth'}).length>0;
   // Do not silently reinterpret explicit axes, mixed length/depth conventions or rotations.
   r.dimensionBasis=/[XYZ]\s*轴|沿\s*[XYZ]|旋转|转向|朝向|长宽互换/i.test(context)||(hasLength&&hasDepth)?'uncertain':hasLength?'length-width':'width-depth';
  }
  const i=result.findIndex(old=>old.target===r.target&&old.kind===r.kind);if(i<0)result.push(r);else result[i]=r;}return result;
}
