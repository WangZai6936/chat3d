import type {SceneDocument} from './types';
/** Semantic cues produce review obligations, never geometric acceptance. Unknown names remain unclassified. */
export function interactionTargets(doc:SceneDocument){
 const groups=new Map<string,typeof doc.nodes>();for(const n of doc.nodes)if(n.visible){const id=n.assemblyId??n.id;groups.set(id,[...(groups.get(id)??[]),n]);}
 return [...groups].flatMap(([id,nodes])=>{
  if(!nodes.some(n=>n.sceneRole==='person'))return [];
  const hands=nodes.filter(n=>/hand|palm|finger|thumb|手掌|手指|拇指|腕/i.test(n.name));
  const tools=nodes.filter(n=>/scanner|tablet|tape gun|caliper|扫码|平板|封箱|卡尺/i.test(n.name));
  return [{id,name:nodes[0].assemblyName??nodes[0].name,nodeIds:[...hands,...tools].map(n=>n.id),handParts:hands.length,toolParts:tools.length,accepted:false as const,required:['手腕至手掌连续且可见','五指/拇指与动作匹配','握柄/边缘处真实包握，工具不能代替手掌','工具朝向和接触面符合用途','检查穿插与悬空，点距离合格不能豁免'],issues:[...(!hands.length?['未识别到手部，需核对语义及几何']:[]),...(tools.length?['手持工具必须查看局部正侧面；持握关系尚未验证']:[])]}];
 });
}
