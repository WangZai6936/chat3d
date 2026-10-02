import {checkRequirements,mergeRequirements,type Requirement,type RequirementReport} from '../domain/requirements';
import {reviewRequirement,visualFingerprint} from '../domain/reviewPolicy';
import {resolveConversationIntent} from '../domain/conversationScope';
import {createAnimationEvaluator} from '../domain/animation';
import { Agent, type AgentTool, type StreamFn, type AgentMessage } from '@earendil-works/pi-agent-core';
import { Type, type Model, type ImageContent, type TSchema } from '@earendil-works/pi-ai';
import { stream } from '@earendil-works/pi-ai/api/openai-completions';
import { buildSceneContext, buildSystemPrompt, getFetch, parseModelResponse, type ModelConfig, type ConversationTurn } from './provider';
import { applyBatch, type Command, type CommandBatch, type ExecutionResult } from '../domain/commands';
import type { SceneDocument } from '../domain/types';
import {inspectSceneQuality,type CompositionPlan,type QualityReport} from '../domain/sceneQuality';
import { SCENE_ROLES, validateDocument } from '../domain/types';
import { captureScene, type CaptureView } from '../scene/capture';
import {checkEditScope,type EditScope} from '../domain/editScope';
import { makeId } from '../util/ids';

import { AGENT_LIMITS } from './agentPolicy';
export { AGENT_LIMITS } from './agentPolicy';
export interface ActivityTiming { id:string; kind:'model'|'tool'; label:string; startedAt:number; firstDataAt?:number; endedAt?:number; failed?:boolean; detail?:string; inputTokens?:number; outputTokens?:number }
export interface DesignBrief {flow:string[];layout:string;equipment:{name:string;count:number;features:string[]}[];checks:string[];composition?:CompositionPlan}
export interface AgentActivity {
  design?:DesignBrief;
  quality?:QualityReport;
  requirements?:RequirementReport;
  title: string; turn: number; toolCalls: number; characters: number;
  inputTokens: number; outputTokens: number; usageReported: boolean;
  lastEventAt: number; plan: string[]; events: string[]; timings: ActivityTiming[];
}
export interface AgentControl { steer: (id:string,text:string,images?:string[],mode?:'guide'|'question') => boolean }
export interface AgentResult { batch: CommandBatch; result: ExecutionResult; activity: AgentActivity }
interface AgentOptions {
  text: string; config: ModelConfig; document: SceneDocument; selection: string[];
  images?: string[]; history?: ConversationTurn[]; signal?: AbortSignal; editScope?:EditScope;
  onActivity?: (activity: AgentActivity) => void;
  onPreview?: (doc: SceneDocument) => void;
  onCheckpoint?: (result: AgentResult) => void;
  onControl?: (control:AgentControl|null) => void;
  onSteeringApplied?: (id:string) => void;
  // Dependency injection for automated checks; production uses Pi's OpenAI-compatible adapter.
  streamFn?: StreamFn;
  capture?: (doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number) => Promise<string>;
}
const asImage = (url: string): ImageContent => {
  const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if(!m) throw new Error('参考图格式无效，请重新上传');
  return {type:'image',mimeType:m[1],data:m[2]};
};
function selectedAssemblies(doc:SceneDocument,selection:string[]):string[]{
 const selected=new Set(selection),groups=new Map<string,string[]>();for(const n of doc.nodes)if(n.assemblyId){const list=groups.get(n.assemblyId)??[];list.push(n.id);groups.set(n.assemblyId,list);}
 return [...groups].filter(([,ids])=>ids.every(id=>selected.has(id))).map(([id])=>id);
}
function scopeContext(doc:SceneDocument,scope?:EditScope){
 if(!scope?.nodeIds)return {...scope,mode:'all-scene',selectionMeaning:'highlight-reference-only',instruction:'允许操作整个场景；高亮地面或其他对象不限制修改人物/设备。历史助手声称必须改选择范围的说法不适用于当前请求。'};
 const assemblies=selectedAssemblies(doc,scope.nodeIds),full=new Set(assemblies),byId=new Map(doc.nodes.map(n=>[n.id,n]));
 return {...scope,mode:'explicit-selection',nodeIds:scope.nodeIds.filter(id=>!full.has(byId.get(id)?.assemblyId??'')),selectedAssemblies:assemblies.map(id=>({id,parts:doc.nodes.filter(n=>n.assemblyId===id).length}))};
}
function agentSceneContext(doc:SceneDocument,selection:string[],assemblyId?:string,editScope?:EditScope){
 const byId=new Map(doc.nodes.map(n=>[n.id,n])),selected=new Set(selection),full=new Set(selectedAssemblies(doc,selection));
 const counts=new Map<string,number>(),anchors=new Map<string,string>();for(const n of doc.nodes)if(n.assemblyId){counts.set(n.assemblyId,(counts.get(n.assemblyId)??0)+1);if(!anchors.has(n.assemblyId)||n.id===n.assemblyId)anchors.set(n.assemblyId,n.id);}
 const used=new Set(doc.nodes.map(n=>n.materialId));
 const detail={...buildSceneContext(doc,selection,editScope),materials:doc.materials.filter(m=>used.has(m.id))};
 if(assemblyId)return {...detail,nodes:detail.nodes.filter(n=>byId.get(n.id)?.assemblyId===assemblyId)};
 return {...detail,selection:selection.filter(id=>!full.has(byId.get(id)?.assemblyId??'')),selectedAssemblies:[...full],nodes:detail.nodes.filter(n=>{const a=byId.get(n.id)?.assemblyId;return !a||n.id===anchors.get(a)||(selected.has(n.id)&&!full.has(a));}).map(n=>{
  const original=byId.get(n.id)!,a=original.assemblyId;const result={...n};
  if(a&&n.id===anchors.get(a)){result.name=original.assemblyName??n.name.split(' · ')[0];result.desc=`组合${counts.get(a)}零件；锚点非中心；明细read_scene({assemblyId:"${a}"})；整机移动/旋转/缩放使用组件命令`;}
  if(result.parentId===null)delete result.parentId;if(result.visible===true)delete result.visible;
  if(JSON.stringify(result.scale)==='[1,1,1]')delete result.scale;if(JSON.stringify(result.rotationQuaternion)==='[0,0,0,1]')delete result.rotationQuaternion;
  return result;
 })};
}

const roleSchema=Type.Union(SCENE_ROLES.map(r=>Type.Literal(r)));
const compositionSchema=Type.Object({zones:Type.Array(Type.Object({name:Type.String({minLength:1,maxLength:80}),purpose:Type.String({minLength:1,maxLength:180})}),{minItems:1,maxItems:12}),connections:Type.Array(Type.Object({from:Type.String({minLength:1,maxLength:80}),to:Type.String({minLength:1,maxLength:80}),via:Type.String({minLength:1,maxLength:80})}),{maxItems:24}),support:Type.Array(Type.Object({name:Type.String({minLength:1,maxLength:80}),role:roleSchema,count:Type.Integer({minimum:1,maximum:100}),purpose:Type.String({minLength:1,maxLength:180})}),{maxItems:24}),palette:Type.Array(Type.String({minLength:1,maxLength:80}),{minItems:1,maxItems:8}),presentation:Type.String({minLength:5,maxLength:600})});
const textResult = (text: string) => ({content:[{type:'text' as const,text}],details:{}});

// Prune only obsolete tool snapshots. Keep call IDs, errors, latest scene and reference images intact.
export function compactAgentContext(messages: AgentMessage[]): AgentMessage[] {
  const sceneEdits=new Set(['edit_scene','configure_animation']);
  let latestScene=-1, latestEdit=-1, latestInspection=-1, latestCaptureRevision='';
  for(let i=0;i<messages.length;i++) {
    const m=messages[i];
    if(m.role!=='toolResult'||m.isError)continue;
    if(m.toolName==='read_scene'||sceneEdits.has(m.toolName))latestScene=i;
    if(sceneEdits.has(m.toolName))latestEdit=i;
    if(m.toolName==='inspect_scene')latestInspection=i;
    if(m.toolName==='capture_view') {
      const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      latestCaptureRevision=/revision=(\d+)/.exec(text)?.[1]??'';
    }
  }
  // Keep the latest detailed read of EACH scope at the current revision.
  // Reading component B must not erase component A's part IDs before a multi-object edit.
  let currentRevision=-1;const scopedReads=new Map<string,number>();
  for(const m of messages)if(m.role==='toolResult'&&!m.isError){const d=m.details as {revision?:number}|undefined;if(typeof d?.revision==='number')currentRevision=Math.max(currentRevision,d.revision);}
  for(let i=0;i<messages.length;i++){const m=messages[i];if(m.role==='toolResult'&&m.toolName==='read_scene'&&!m.isError){const d=m.details as {revision?:number;scopeKey?:string;snapshot?:boolean}|undefined;if(d?.revision===currentRevision&&d.snapshot&&d.scopeKey)scopedReads.set(d.scopeKey,i);}}
  const retainedReads=new Set([...scopedReads.values()].sort((a,b)=>b-a).slice(0,24));
  // Remove old successful edit call/result PAIRS, preserving the newest edit, errors,
  // user instructions and IDs supplied by current scene reads. Never mutate stored transcript.
  const historical=new Map<string,string>();
  for(let i=0;i<latestEdit;i++){
    const m=messages[i];if(m.role==='toolResult'&&sceneEdits.has(m.toolName)&&!m.isError&&i!==latestScene&&i!==latestEdit)historical.set(m.toolCallId,'');
  }
  const paired=new Set<string>();
  for(const m of messages)if(m.role==='assistant')for(const c of m.content)if(c.type==='toolCall'&&historical.has(c.id))paired.add(c.id);
  return messages.map((m,i)=>{
    if(m.role==='assistant')return {...m,content:m.content.map(c=>c.type==='toolCall'&&paired.has(c.id)?{type:'text' as const,text:`[历史edit_scene已成功：${String(c.arguments.summary??'场景修改').slice(0,180)}。参数已省略，以最新场景与read_scene为准。]`}:c)};
    if(m.role!=='toolResult')return m;
    if(m.isError){if(m.toolName!=='plan_model')return m;return {...m,content:m.content.map(c=>c.type==='text'?{...c,text:c.text.split('Received arguments:')[0].slice(0,1800)+'\n规划参数未通过校验，场景未改变。steps和每类设备features最多24项；合并同类条目后重新调用plan_model，保留需求含义。不要原样重复失败参数。'}:c)};}
    if(m.toolName==='inspect_scene'&&i!==latestInspection)return {...m,content:[{type:'text' as const,text:'历史场景检查已省略，请以最新检查和当前几何为准。'}]};
    if((m.toolName==='read_scene'||sceneEdits.has(m.toolName))&&i!==latestScene&&i!==latestEdit&&!retainedReads.has(i))
      return {...m,content:[{type:'text' as const,text:'该历史场景快照已由后续成功操作更新。请以最新场景工具结果为准；本工具执行成功。'}]};
    if(m.toolName==='capture_view'&&latestCaptureRevision) {
      const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      if(/revision=(\d+)/.exec(text)?.[1]!==latestCaptureRevision)
        return {...m,content:[{type:'text' as const,text:'历史版本截图已省略。请检查最新版本截图；原始参考图保持不变。'}]};
    }
    return m;
  }).filter(m=>!(m.role==='toolResult'&&paired.has(m.toolCallId)));
}

export async function runModelingAgent(options: AgentOptions): Promise<AgentResult> {
  const { config:cfg, signal }=options;
  if(signal?.aborted) throw new DOMException('已停止','AbortError');
  const base=structuredClone(options.document);
  let draft=structuredClone(base);
  const originallySelectedAssemblies=new Set(selectedAssemblies(base,options.selection));
  const selectionForDoc=(doc:SceneDocument)=>{const ids=new Set(options.selection);for(const n of doc.nodes)if(n.assemblyId&&originallySelectedAssemblies.has(n.assemblyId))ids.add(n.id);const existing=new Set(doc.nodes.map(n=>n.id));return [...ids].filter(id=>existing.has(id));};
  const resolvedIntent=resolveConversationIntent(options.text,options.history);
  const continuation=resolvedIntent!==options.text;
  let wantsAnimation=/动起来|动画|动作|没有动|没动|运动|循环播放|animate/i.test(resolvedIntent)&&!/(不要|无需|不需要).{0,5}(?:动画|动作)/.test(resolvedIntent);
  const needsDesign=base.nodes.length===0&&/车间|产线|仓库|工厂|workshop|factory|warehouse|production line/i.test(options.text);
  let requirements:Requirement[]=[];const userTexts=[resolvedIntent];const executionTexts=[resolvedIntent];let questionOnly=false,requirementsNeedRefresh=false;
  const operations: Command[]=[];
  const applied: ExecutionResult['applied']=[];
  let capturedRevision=-1, capturedTurn=-1, reviewedRevision=-1, reviewedWholeRevision=-1, captureScope='whole', submitted=false, summary='';
  let progressVersion=0, observedProgress=0, stagnantTurns=0, failedTurns=0, pauseReason='',lastToolError='';
  let turnActions:string[]=[],turnErrors:string[]=[];const rootToolErrors:string[]=[];
  let readRevision=-1,preparationReads=0;const readScopes=new Set<string>();
  const capturedViews=new Set<string>(),reviewedViews=new Set<string>();
  let latestCaptureKey='',animationCheckedRevision=-1;
  const progress=()=>{progressVersion++;};
  let reviewIssues:string[]=[];
  let activity: AgentActivity={title:'准备 Pi 建模任务',turn:0,toolCalls:0,characters:0,inputTokens:0,outputTokens:0,usageReported:false,lastEventAt:Date.now(),plan:[],events:[],timings:[]};
  const emit=(title:string,record=false) => {
    activity={...activity,title,lastEventAt:Date.now(),events:record?[...activity.events,title].slice(-30):activity.events};
    options.onActivity?.({...activity,plan:[...activity.plan],events:[...activity.events],timings:activity.timings.map(t=>({...t}))});
  };
  const checkpoint=(reason='任务尚未完成') : AgentResult => ({
    batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:[...options.selection],editScope:options.editScope,
      incomplete:true,continuation:`继续完成原任务：${executionTexts.join('；补充：') || '根据参考图建模'}。当前场景是已保留的阶段成果，先检查现有对象，保留有效部分，不要重复创建；优先完成下一阶段并截图复核。`,
      summary:`阶段草稿已保留（未完成最终复核）\n${reason}\n已执行 ${operations.length} 项操作，当前 ${draft.nodes.length} 个对象。请人工检查后保留此阶段，或放弃。`+(reviewIssues.length?'\n已知问题：'+reviewIssues.join('；'):''),operations:structuredClone(operations)},
    result:{doc:structuredClone(draft),applied:structuredClone(applied),errors:[]},activity:structuredClone(activity)
  });
  const stamp=(id:string,patch:Partial<ActivityTiming>)=>{activity.timings=activity.timings.map(t=>t.id===id?{...t,...patch}:t);};
  const firstData=()=>{const t=activity.timings.find(t=>t.id===`model-${calls}`);if(t && t.firstDataAt===undefined)stamp(t.id,{firstDataAt:Date.now()});};
  const check=() => {if(signal?.aborted)throw new DOMException('已停止','AbortError');};
  const tool=<T extends TSchema>(name:string,label:string,description:string,parameters:T,execute:AgentTool<T>['execute']):AgentTool<any>=>({name,label,description,parameters,executionMode:'sequential',execute:execute as AgentTool['execute']});
  const tools: AgentTool<any>[]=[
    tool('check_requirements','核对明确需求','整理用户明确的数量、尺寸、配色及布局要求并用真实场景核对。quote必须逐字引用用户原文，target必须出现在用户指令中。kind=count填阿拉伯数字；height/width/depth为世界坐标Y/X/Z包围盒尺寸，expected填米数；color与other只报告待人工核对。不要把假设加入清单；新要求覆盖同目标同类型旧要求。省略items可复查已有清单；unknown不等于缺失或通过。',Type.Object({items:Type.Optional(Type.Array(Type.Object({quote:Type.String({minLength:1,maxLength:300}),target:Type.String({minLength:1,maxLength:80}),kind:Type.Union(['count','height','width','depth','color','other'].map(v=>Type.Literal(v))),expected:Type.String({minLength:1,maxLength:160})}),{maxItems:30}))}),async(_id,args)=>{
      check();const next=mergeRequirements(requirements,(args.items??[]) as Requirement[],userTexts);if(JSON.stringify(next)!==JSON.stringify(requirements))progress();requirements=next;if(args.items?.length)requirementsNeedRefresh=false;activity.requirements=checkRequirements(draft,requirements);emit(`需求核对：${activity.requirements.items.filter(r=>r.status==='mismatch').length}项不符，${activity.requirements.items.filter(r=>r.status==='unknown').length}项待核对`,true);return textResult(JSON.stringify(activity.requirements));
    }),
    tool('plan_model','规划建模步骤','修改前记录操作计划与尺寸假设：steps为1–24项，每类设备features为1–24项。超限请合并同类条目，不能删除用户要求。完整车间/产线/仓库需提供design和composition：工艺顺序、布局、设备特征、分区、连接、配套、配色取景与验收检查。只记录交付设计，不输出内部推理。',Type.Object({steps:Type.Array(Type.String({maxLength:240}),{minItems:1,maxItems:24}),assumptions:Type.String({maxLength:1600}),design:Type.Optional(Type.Object({flow:Type.Array(Type.String({maxLength:100}),{minItems:1,maxItems:12}),layout:Type.String({minLength:5,maxLength:600}),equipment:Type.Array(Type.Object({name:Type.String({minLength:1,maxLength:80}),count:Type.Integer({minimum:1,maximum:100}),features:Type.Array(Type.String({maxLength:240}),{minItems:1,maxItems:24})}),{minItems:1,maxItems:16}),checks:Type.Array(Type.String({maxLength:120}),{minItems:1,maxItems:8}),composition:Type.Optional(compositionSchema)}))}),async(_id,args)=>{
      check();if(needsDesign&&(!args.design||!args.design.composition))throw new Error('完整场景请先补全design：flow、layout、equipment（名称/数量/特征）、checks，以及composition（分区、连接、配套、配色与取景），不能直接堆占位模型');
      if(!activity.plan.length)progress();
      activity.plan=args.steps;activity.design=args.design;emit(`计划：${args.steps.join(' → ')}；${args.assumptions}`,true);return textResult('设计已记录。按设备→输送/转运→工位→物料→人员动作建立关系；先完成各类代表设备近景，再布置同类设备与配套。createAssembly的planKey对应设计清单名称，sceneRole标明类别；不适用的配套不添加。局部编辑严格遵守本次作用范围。');
    }),
    tool('read_scene','读取当前场景','默认只返回组件摘要。修改人物手臂等零件需传assemblyId读取组件全部真实零件，或nodeIds读取指定对象，二者可同时提供，合并去重返回明细。当前版本不同目标的明细会一起保留，重复同一目标不提供新信息；资料齐全后配置动画或修改模型。',Type.Object({assemblyId:Type.Optional(Type.String()),nodeIds:Type.Optional(Type.Array(Type.String(),{maxItems:64}))},{additionalProperties:false}),async(_id,args)=>{
      check();const request={...args,assemblyId:args.assemblyId||undefined,nodeIds:args.nodeIds?.length?args.nodeIds:undefined};
      if(request.assemblyId&&!draft.nodes.some(n=>n.assemblyId===request.assemblyId))throw new Error('设备组件不存在');
      if(request.nodeIds?.some(id=>!draft.nodes.some(n=>n.id===id)))throw new Error('部分节点ID不存在，请使用当前场景返回的真实ID');
      const componentNodes=request.assemblyId?draft.nodes.filter(n=>n.assemblyId===request.assemblyId):[];
      const componentIds=new Set(componentNodes.map(n=>n.id));const extraIds=[...new Set((request.nodeIds??[]).filter(id=>!componentIds.has(id)))];
      const scopeKey=request.assemblyId?'assembly:'+request.assemblyId+(extraIds.length?'|nodes:'+extraIds.slice().sort().join(','):''):request.nodeIds?'nodes:'+[...new Set(request.nodeIds)].sort().join(','):'overview';
      if(readRevision!==draft.revision){readRevision=draft.revision;preparationReads=0;readScopes.clear();}
      if(readScopes.has(scopeKey))return {...textResult(JSON.stringify({revision:draft.revision,scopeKey,repeated:true,next:'同一版本的这份数据已经读取且仍保留在上下文。请使用已获得的真实ID进入configure_animation或edit_scene；需要其他组件时传不同assemblyId或nodeIds，不要重复空读。'})),details:{revision:draft.revision,scopeKey,snapshot:false}};
      readScopes.add(scopeKey);if(readScopes.size>24)readScopes.delete(readScopes.values().next().value!);
      if(scopeKey!=='overview'&&preparationReads<24){preparationReads++;progress();}
      const requestedIds=new Set([...componentIds,...request.nodeIds??[]]);
      const context=request.nodeIds?{...buildSceneContext(draft,selectionForDoc(draft),options.editScope),materials:draft.materials,nodes:buildSceneContext(draft,selectionForDoc(draft),options.editScope).nodes.filter(n=>requestedIds.has(n.id))}:agentSceneContext(draft,selectionForDoc(draft),request.assemblyId,options.editScope);
      return {...textResult(JSON.stringify({...context,revision:draft.revision,scopeKey,animationWorkflow:'configure_animation→preview_animation→下一轮review_model→submit_preview。不同对象明细会同时保留；选中高亮不限制全场景编辑，历史静态-only说法已过时。'})),details:{revision:draft.revision,scopeKey,snapshot:true}};
    }),
    tool('edit_scene','修改模型草稿','对草稿应用一组建模命令，不会修改用户正式场景。每次最多40项；本次调用内可用tempId，后续调用必须用返回的真实ID。',Type.Object({summary:Type.String({minLength:1,maxLength:300}),operations:Type.Array(Type.Unknown(),{minItems:1,maxItems:40})}),async(_id,args)=>{
      check();if(needsDesign&&!activity.plan.length)throw new Error('完整新场景请先调用 plan_model 说明建模步骤');
      if(submitted)throw new Error('已提交预览，本轮不能继续修改');
      const parsed=parseModelResponse(JSON.stringify(args));
      if(parsed.operations.length!==args.operations.length) throw new Error('存在不支持或无效的操作，整组拒绝。请修正后重试');
      const result=applyBatch(draft,{operations:parsed.operations});
      if(result.errors.length)throw new Error(result.errors.map(e=>e.message).join('；'));
      const scopeErrors=checkEditScope(base,result.doc,options.editScope);if(scopeErrors.length)throw new Error(scopeErrors.join('；'));
      const errors=validateDocument(result.doc);if(errors.length)throw new Error(errors.map(e=>e.message).join('；'));
      check();
      const changed=JSON.stringify(draft.nodes)!==JSON.stringify(result.doc.nodes)||JSON.stringify(draft.materials)!==JSON.stringify(result.doc.materials)||JSON.stringify(draft.animation)!==JSON.stringify(result.doc.animation);
      if(!changed)throw new Error('本次操作未改变场景，请执行计划中的有效修改或复核提交');
      progress();
      const oldRevision=draft.revision,sameVisual=visualFingerprint(draft)===visualFingerprint(result.doc);
      draft=result.doc;if(requirements.length)activity.requirements=checkRequirements(draft,requirements);applied.push(...result.applied);operations.push(...parsed.operations);
      if(sameVisual){if(capturedRevision===oldRevision)capturedRevision=draft.revision;if(reviewedRevision===oldRevision)reviewedRevision=draft.revision;if(reviewedWholeRevision===oldRevision)reviewedWholeRevision=draft.revision;if(animationCheckedRevision===oldRevision)animationCheckedRevision=draft.revision;}else reviewedRevision=-1;
      options.onCheckpoint?.(checkpoint());options.onPreview?.(draft);emit(`草稿已更新：${args.summary}（共 ${draft.nodes.length} 个对象）`,true);
      return {...textResult(JSON.stringify({revision:draft.revision,scene:agentSceneContext(draft,selectionForDoc(draft),undefined,options.editScope),review:reviewRequirement(base,draft),next:'按实际修改复核：none无需截图可提交；local可用受影响组件近景；whole需全景；animation需动态样本。截图后下一轮review_model。完成用户要求即可提交，不要追加无关工序。'})),details:{revision:draft.revision}};
    }),
    tool('inspect_scene','检查场景完整度','根据当前真实草稿返回组件空间边界并核对设计清单、配套连接间距、设备包围盒交叠、人物尺度和墙地面材质。结果是检查线索，不是工程或视觉合格证明。修改后需重新检查；可与最终截图同一轮调用。',Type.Object({}),async()=>{
      check();const report=inspectSceneQuality(draft,activity.design);if(activity.quality?.revision!==draft.revision)progress();activity.quality=report;emit(`场景检查：${report.componentCount}个组件，${report.issues.length}条待核对事项`,true);return textResult(JSON.stringify(report));
    }),
    tool('capture_view','获取模型截图','渲染最新草稿并返回实际截图供视觉检查。必须在最后一次修改后截图。只在关键阶段或修正后截图。按edit_scene返回的review选择范围：结构/布局用scope=scene全景且不传assemblyId；单组件外观可用scope=assembly及assemblyId近景；非视觉修改无需截图。省略scope时兼容旧调用：传assemblyId为近景，否则为全场景。',Type.Object({view:Type.Union([Type.Literal('perspective'),Type.Literal('front'),Type.Literal('side'),Type.Literal('top')]),scope:Type.Optional(Type.Union([Type.Literal('scene'),Type.Literal('assembly')])),assemblyId:Type.Optional(Type.String())}),async(_id,args)=>{
      check();
      if(args.scope==='scene'&&args.assemblyId)throw new Error('全场景截图scope=scene时请省略assemblyId，不能把近景称为全景');
      if(args.scope==='assembly'&&!args.assemblyId)throw new Error('设备近景scope=assembly需要真实assemblyId');
      const targetIds=args.assemblyId?draft.nodes.filter(n=>n.assemblyId===args.assemblyId).map(n=>n.id):undefined;
      if(targetIds&&!targetIds.length)throw new Error('截图目标组合不存在，请读取真实assemblyId');
      const data=await (options.capture??captureScene)(draft,args.view,targetIds);check();captureScope=args.assemblyId??'whole';const key=`${draft.revision}:${args.view}:${captureScope}`;latestCaptureKey=key;if(!capturedViews.has(key)){capturedViews.add(key);progress();}capturedRevision=draft.revision;capturedTurn=calls;
      emit(`已获取 ${captureScope==='whole'?'全场景':'设备近景 '+captureScope} / ${args.view} 截图（版本 ${draft.revision}），等待模型复核`,true);
      return {content:[{type:'text' as const,text:`这是草稿 revision=${draft.revision} scope=${captureScope} 的真实渲染截图。对照用户参考图检查。`},asImage(data)],details:{revision:draft.revision,view:args.view,scope:captureScope}};
    }),
    tool('configure_animation','生成或修改动画','直接为现有场景创建可播放动画，不是文字建议。保留布局，用真实对象ID配置运动。需先plan_model。完整替换动画时保留不需修改的轨道。移动/停留/往返用position关键帧；转动用rotation；显隐visibility；跟随释放follow；复杂曲线用受限表达式。完成后preview_animation→下一轮review_model→submit_preview。',Type.Object({summary:Type.String({minLength:1,maxLength:300}),name:Type.String({minLength:1,maxLength:120}),duration:Type.Number({exclusiveMinimum:0,maximum:3600}),loop:Type.Boolean(),tracks:Type.Array(Type.Object({id:Type.String({minLength:1,maxLength:120}),name:Type.String({maxLength:120}),targetIds:Type.Array(Type.String(),{minItems:1,maxItems:512}),channel:Type.Union(['position','rotation','scale','visibility','follow'].map(v=>Type.Literal(v))),keyframes:Type.Optional(Type.Array(Type.Object({time:Type.Number({minimum:0}),value:Type.Union([Type.Number(),Type.Boolean(),Type.Tuple([Type.Number(),Type.Number(),Type.Number()])])}),{minItems:1,maxItems:128})),expression:Type.Optional(Type.Unknown()),axis:Type.Optional(Type.Tuple([Type.Number(),Type.Number(),Type.Number()])),pivot:Type.Optional(Type.Tuple([Type.Number(),Type.Number(),Type.Number()])),sourceId:Type.Optional(Type.String()),start:Type.Optional(Type.Number({minimum:0})),end:Type.Optional(Type.Number({minimum:0}))}),{minItems:1,maxItems:128})}),async(id,args)=>{
      const {summary:description,...program}=args;const editor=tools.find(t=>t.name==='edit_scene')!;
      const result=await editor.execute(id,{summary:description,operations:[{op:'setAnimation',animation:{version:1,...program}}]},signal,()=>{});
      return {...result,content:[...result.content,{type:'text',text:'动画配置已写入草稿。现在必须调用preview_animation检查动态样本，下一轮review_model，然后submit_preview；无需让用户手工编写动画或建立动作库。'}]};
    }),
    tool('preview_animation','检查动态预览','对当前动画在三个不同时间点实际求值并渲染，检查运动对象与场景关系。不能代替真实碰撞/生产仿真。动画变更后提交前必须调用，下一轮review_model复核图片。',Type.Object({}),async()=>{
      check();if(!draft.animation)throw new Error('尚无动画，请先通过edit_scene的setAnimation配置运动轨道');
      const evaluate=createAnimationEvaluator(draft),candidates=new Set<number>([draft.animation.duration*.381966,draft.animation.duration*.618034,draft.animation.duration]);
      for(const track of draft.animation.tracks){const keys=track.keyframes??[];for(let i=1;i<keys.length;i++)if(JSON.stringify(keys[i].value)!==JSON.stringify(keys[i-1].value)){candidates.add((keys[i].time+keys[i-1].time)/2);candidates.add(keys[i].time);break;}if(track.channel==='follow')candidates.add((track.start!+track.end!)/2);}
      const first=evaluate(0),times=[0];let previous=JSON.stringify([...first]);for(const time of candidates){const current=JSON.stringify([...evaluate(time)]);if(current!==previous){times.push(time);previous=current;if(times.length===3)break;}}if(times.length<3)times.push(draft.animation.duration);
      const content:({type:'text';text:string}|ImageContent)[]=[];let moving=false;
      for(const time of times){const poses=evaluate(time);if([...poses].some(([id,p])=>JSON.stringify(p)!==JSON.stringify(first.get(id))))moving=true;const picture=await (options.capture??captureScene)(draft,'perspective',undefined,time);check();content.push({type:'text',text:`动态样本 time=${time.toFixed(2)}s revision=${draft.revision} scope=whole；不是完整碰撞或动画验收`},asImage(picture));}
      if(!moving)throw new Error('三个动画样本没有可见变化，请检查目标、关键帧/表达式和时长，不要声称已让场景动起来');
      const key=`${draft.revision}:animation:whole`;if(!capturedViews.has(key)){capturedViews.add(key);progress();}latestCaptureKey=key;capturedRevision=draft.revision;capturedTurn=calls;captureScope='whole';animationCheckedRevision=draft.revision;
      emit(`动态预览：${draft.animation.tracks.length}条轨道，已检查三个时间样本，等待视觉复核`,true);return {content,details:{revision:draft.revision,times}};
    }),
    tool('review_model','记录视觉检查','看过最新截图后记录外轮廓、比例、悬空/穿插、颜色和参考图差异。存在差距必须如实记录。',Type.Object({observations:Type.String({minLength:5,maxLength:1200}),issues:Type.Array(Type.String({maxLength:200}),{maxItems:8})}),async(_id,args)=>{
      check();if(calls<=capturedTurn)throw new Error('截图刚刚返回，请在下一轮读取图片后再调用 review_model，不能提前编造视觉检查');
      if(capturedRevision!==draft.revision)throw new Error('请先获取当前版本截图，再做视觉检查');
      if(!reviewedViews.has(latestCaptureKey)){reviewedViews.add(latestCaptureKey);progress();}
      reviewedRevision=draft.revision;if(captureScope==='whole')reviewedWholeRevision=draft.revision;reviewIssues=[...args.issues];
      emit(`视觉检查（${captureScope==='whole'?'全场景':'设备近景'} / 版本 ${draft.revision}）：${args.observations}${args.issues.length?'；待改进：'+args.issues.join('；'):''}`,true);
      return textResult((args.issues.length?'差异已记录，未解决问题必须在submit_preview明确列出。':'已记录模型自检，不代表人工验收通过。')+(reviewedWholeRevision===draft.revision||(reviewRequirement(base,draft).kind==='local'&&reviewRequirement(base,draft).assemblyId===captureScope)?' 当前所需范围复核已完成，达到本轮要求即可submit_preview；其他限制如实列出，不要反复截图空转。':' 此次修改涉及更广范围，提交前还需capture_view({view:"perspective",scope:"scene"})，下一轮review_model。'));
    }),
    tool('submit_preview','提交待确认预览','结束本轮，把草稿交给用户确认，不能直接写入正式场景。按实际修改范围复核：纯名称/分类无需截图；单组件外观可近景；结构/布局用全景；动画用动态样本。',Type.Object({summary:Type.String({minLength:1,maxLength:1200}),remainingIssues:Type.Array(Type.String({maxLength:200}),{maxItems:8})}),async(_id,args)=>{
      check();if(draft.animation&&JSON.stringify(draft.animation)!==JSON.stringify(base.animation)&&animationCheckedRevision!==draft.revision)throw new Error('动画已修改，请先preview_animation检查运动样本，并在下一轮review_model复核后提交');if(needsDesign&&activity.quality?.revision!==draft.revision)throw new Error('完整场景提交前请调用inspect_scene检查最新草稿的配套、连接与尺度');if(!operations.length)throw new Error('未修改场景，无需提交；直接回答用户即可');
      const requirement=reviewRequirement(base,draft);
      const reviewed=reviewedRevision===draft.revision&&(reviewedWholeRevision===draft.revision||(requirement.kind==='local'&&captureScope===requirement.assemblyId));
      if(requirement.kind==='local'&&!reviewed)throw new Error(`请对修改的组件 capture_view({view:"perspective",scope:"assembly",assemblyId:"${requirement.assemblyId}"})，下一轮 review_model 后提交；无需重复全场景检查。`);
      if(requirement.kind!=='none'&&!reviewed)throw new Error(`尚未完成版本 ${draft.revision} 的全场景复核（最近截图范围：${captureScope==='whole'?'全场景':'设备近景 '+captureScope}；最近全景复核版本：${reviewedWholeRevision<0?'无':reviewedWholeRevision}）。请调用 capture_view({view:"perspective",scope:"scene"})，省略assemblyId；下一轮读取图片并调用review_model，再submit_preview。`);
      const remaining=[...new Set([...reviewIssues,...args.remainingIssues,...(activity.quality?.revision===draft.revision?activity.quality.issues:[])])];
      activity.requirements=checkRequirements(draft,requirements);
      const unchecked=activity.requirements.items.filter(r=>r.status!=='pass');
      if(requirementsNeedRefresh)remaining.push('最新补充要求尚未重新整理核对');
      remaining.push(...unchecked.map(r=>`需求${r.status==='mismatch'?'不符':'待核对'}：${r.quote}；${r.actual}`));
      summary=args.summary+(remaining.length?'\n仍需改进：'+remaining.join('；'):requirement.kind==='none'?'\n已完成数据校验；本次非视觉修改无需重新截图。':'\n已完成模型自检，仍请人工核对参考图。');
      submitted=true;emit('已完成本轮，等待你确认应用',true);
      return {...textResult('预览已提交，等待用户确认应用。'),terminate:true};
    }),
  ];
  const model:Model<'openai-completions'>={id:cfg.model,name:cfg.model,api:'openai-completions',provider:'chat3d-gateway',baseUrl:cfg.baseURL.trim().replace(/\/+$/,''),reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:AGENT_LIMITS.outputPerTurn,compat:{supportsDeveloperRole:false,supportsReasoningEffort:false,supportsStore:false,supportsUsageInStreaming:true,maxTokensField:'max_tokens'}};
  const geometryGuide=buildSystemPrompt(agentSceneContext(draft,selectionForDoc(draft),undefined,options.editScope)).replace(/# 参考范例[\s\S]*?# 图片/, '# 图片').replace(/# 输出格式[\s\S]*?(?=\n# |$)/, '');
  const prompt=`你是 chat3d 的分步建模 agent。用户最新明确需求优先于默认展示设置、旧方案和模型假设；本次编辑约束已按当前指令计算，不要凭历史高亮或旧助手说法制造限制。单次工具的容量限制应通过分批操作满足完整需求，不得据此擅自缩水任务。真实安全边界、数据合法性和不支持的能力必须如实说明，不能伪造完成。用工具操作草稿，用户确认前禁止修改正式场景。\n用户要求动态时优先调用原生configure_animation工具生成可播放配置（也兼容edit_scene中的setAnimation），不能用文字建议代替实现，也不要求用户先建动作库。支持通用关键帧与受限数学表达式、绑定及时间编排；不支持任意JavaScript/物理仿真。修改动画后preview_animation→下一轮review_model→submit_preview。\n复杂新场景先plan_model；已有场景的明确小改动可直接edit_scene。按工具返回review决定是否及如何截图，收到图片后下一轮review_model，达到要求后submit_preview。纯名称/分类修改无需截图；单组件外观可近景，不必全景；结构/布局用全景；动画用动态样本。\n每轮可调用多个工具，顺序执行。没有固定总轮数；有有效进展就继续。连续4轮没有新的目标明细、实际场景变化或视觉检查进展，或连续3轮工具调用失败且没有有效进展时会暂停并保留草稿。
完整车间/产线/仓库必须先用plan_model.design明确工艺顺序、布局、设备清单及数量/识别特征、验收项，并填写composition：zones分区用途、connections设备之间经何种配套连接（from/to/via用清单名称）、support配套名称/角色/数量/目的、palette统一配色、presentation镜头与材质层次。没有关系的场景connections可空，用户不需要的机器人/人员等不要强加。
完整度标准：每个生产单元根据其工艺需要安排操作面、进出料位置、线边物料、人员动作；输送与人工工位应实际接近而非分散摆放。人员面向实际操作区域，手部与工作高度相称。生产/暂存/物流分区有连续通路；紧凑作业区与留白通道协调，避免任意放大空地。
细节标准：同类设备的门窗、HMI、把手/通风/灯等按实际功能保持相近完成度；货架配合实际物料容器，台面配合工件，安全设施按需要设置。不要堆装饰零件刷数量。灰蓝低饱和主体、有限的安全/状态强调色可作为无指定风格时的默认假设；用户指定色优先。墙地面、设备喷漆、金属、玻璃和服装区别处理，主要设备避免全黑或全白一块。
建模时每个逻辑实体一个createAssembly，填写planKey（对应equipment或support的name）、sceneRole、zone。旧场景可setAssemblyMetadata补分类；分类本身不是完成建模。最终组合调用inspect_scene与capture_view，再针对清单缺口、包围盒候选穿插和近远景问题修正。检查工具不能判断工艺正确性、管线是否真正接通，必须看图核对。没有明确尺寸则在假设中标明，禁止改成其他工艺预设。优先完成各类代表设备的结构，必要时近景检查，再duplicateAssembly布置同类设备；允许批量完成后统一检查，避免重复输出同样部件或机械地逐台检查。
复杂任务按用户实际范围完成布局、设备与所需配套；用户未要求的人员、环境、动画等不强制补齐。布局占位仅为中间步骤，必须继续细化；不能把占位箱体作为完整车间交付，也不能仅因轮数增加要求用户重新发送。只有用户明确要求草图或真实能力受限时才提交未完成范围。
先按用户描述规划具体工艺和设备关系，利用自由组合、阵列和复制减少重复参数；禁止固定预设替换用户需求。设备应有可辨识的结构、开口、门板、操作部件和尺度，整体空间、连接与材质应统一。对象数量本身不是质量标准。
明确需求核对：用户明确提出的数量、尺寸、颜色、排布等，用check_requirements逐字引用并记录；不记录模型自己的假设。尺寸填米，数量按完整组件。修改后复查，不符先局部修正；无法自动核对的如实标为待核对。此清单不是新权限限制，不应阻止用户保留阶段结果。\n视觉要求：不同设备应有不同外轮廓、门窗开口和功能机构，不要仅换盒子颜色。优先用frame形成真正的开口、trapezoid构成斜面与收分、tube表现中空结构；避免实体外壳封住加工空间。人物用胶囊四肢、椭球头部和适度收分的躯干，手部接近实际操作位置。
空间要求：按用户工艺组织设备顺序和朝向，保留人员操作面与连续通道，补齐必要的线边物料、转运和安全分区；无依据的设施不要凭空堆砌。前景、中景、背景有主次，设备与地面、墙面材质分离。
质量复核：先用capture_view({view:'perspective',assemblyId:'真实组合ID'})检查代表设备的开口、部件贴合、材质和人物尺度；修正后再拍全景检查疏密、连接和统一观感。不能只凭远景小图宣布细节合格。截图中的框选线或界面不属于模型细节。
每次 edit_scene 控制在40项以内，较大的场景分批构建并连续推进。出现错误先根据具体错误修正；不要重复相同失败调用。完成结构和细节后截图，视觉问题可修复时继续编辑、截图、复核，再提交。
效率规则：空场景创建时，尽量在同一响应依次调用 plan_model、edit_scene；复杂场景按计划分批编辑后再 capture_view；工具仍按顺序执行。拿到截图后，在下一响应调用 review_model；达到用户要求后再 submit_preview。只在需要真实ID或额外信息时调用 read_scene，edit_scene 已返回最新完整场景，不要重复读取。必须依赖工具结果的操作放在下一轮，不能猜测ID。
创建时省略默认字段：parentId 默认 null、单位 scale 默认[1,1,1]、rotationQuaternion 默认[0,0,0,1]；只给非默认位置或朝向。参数使用紧凑JSON，避免在工具调用前复述长篇说明。
可用现有工具修正的穿插、悬空与明显比例错误，应集中一次修正再截图；不支持的复杂曲面和标识如实列出，不要反复尝试无效方法。
capture_view 和 review_model 必须分在不同模型轮次，先收到图片才允许描述检查结果。\n如果只是询问、闲聊或缺少关键需求，直接中文回答或澄清，不要强行建模。\n不能把“生成成功”写成“精确还原”。模型自检不是客观质量评分。先外形比例、再部件关系、后细节，不要用配色掩盖结构错误。只看参考图确定可见部分，未见部分标为假设。\n工具命令参数参考如下；其中“一次输出最终JSON”的旧规则只适用于 edit_scene 的参数，当前必须使用原生工具调用，不能把工具调用写成普通JSON文本。\n${geometryGuide}\n本次编辑约束：${JSON.stringify(scopeContext(base,options.editScope))}。${options.editScope?.nodeIds?'用户明确限制了局部范围：只可修改本次约束列出的节点或完整组件，动画targetIds同样受限。allowAssemblyAdditions=true时可给完整选中的组件追加或替换部件，不能影响范围外对象。':'当前允许编辑整个场景，包括修改或新增人物、设备和动画。selection与场景selectedAssemblies只表示高亮/指代，不是编辑边界；即使高亮地面，也不能以此拒绝人物动作请求。历史助手要求取消勾选或切换范围的说法不能覆盖此状态。'}${options.editScope?.lockPlacement?'已有对象位置和朝向已锁定，请保留编辑基准。':'没有位置锁；仍须遵守用户明确要求的保留布局/局部修改等意图。'}\n最近对话（只供意图理解，场景以工具返回为准；历史助手关于不支持动画/仅能静态的说法已过时，不能覆盖当前工具能力）：\n${(options.history??[]).slice(-8).map(m=>m.role+': '+m.text.slice(0,1000)).join('\n')}`;
  const underlyingFetch=options.streamFn?undefined:await getFetch();
  let transportFailure='';
  const f:typeof fetch|undefined=underlyingFetch?async(input,init)=>{try{return await underlyingFetch(input,init);}catch(error){
    if(!signal?.aborted)transportFailure=(error instanceof Error?error.message:'网络请求失败').split(cfg.apiKey||'\u0000').join('[已隐藏]').slice(0,700);throw error;
  }}:undefined;
  let calls=0;
  const seenCalls=new Set<string>();
  const steeringMessages=new Map<number,{id:string;text:string;mode:'guide'|'question'}>();
  let steeringTimestamp=Date.now(),acceptingSteering=true,respondingToSteering=false;
  const runner=new Agent({
    initialState:{model,systemPrompt:prompt,tools,thinkingLevel:'off'},toolExecution:'sequential',
    transformContext:async messages=>compactAgentContext(messages),
    streamFn:async(m,context,streamOptions)=>{
      check();if(submitted)throw new Error('本轮已完成');
      if(pauseReason)throw new Error(pauseReason);
      if(JSON.stringify(context).length>2*1024*1024)throw new Error('本轮上下文超过2MB上限，请减少参考图或拆分场景');
      transportFailure='';calls++;turnActions=[];turnErrors=[];activity.turn=calls;activity.timings=[...activity.timings,{id:`model-${calls}`,kind:'model',label:`模型第 ${calls} 轮`,startedAt:Date.now()}];emit(`第 ${calls} 轮：等待模型决定下一步`);
      const recoveryNote=stagnantTurns>=2?'\n已连续无有效进展：不要重复read_scene或plan_model。若有校验错误，先修正失败参数；若计划已记录，执行一个最小有效edit_scene；若模型已完成，按review要求检查并提交；非视觉修改可直接提交。无法继续应明确说明阻碍。':'';
      const animationNext=wantsAnimation?(!activity.plan.length?'本轮用户要求实际动画：先plan_model，然后configure_animation。':JSON.stringify(draft.animation)===JSON.stringify(base.animation)?'本轮动画尚未创建或修改：下一步应configure_animation，不要只反复read_scene/capture_view。':animationCheckedRevision!==draft.revision?'动画已配置：下一步preview_animation。':reviewedWholeRevision!==draft.revision?'动态样本已返回：下一轮review_model。':'动态复核已完成：若需求已满足，下一步submit_preview。'):'';
      const budgetNote=`\n${continuation?'本轮继续此前用户需求：'+resolvedIntent.slice(0,500)+'。':''}当前第${calls}轮，连续${stagnantTurns}轮没有有效进展。继续完成计划与细节，不因轮数增加提前收尾。当前输入${activity.inputTokens}、输出${activity.outputTokens} Token；避免无效重复。${animationNext}${recoveryNote}`;
      context={...context,messages:context.messages.map((message,index)=>index===0 && message.role==='system'?{...message,content:typeof message.content==='string'?message.content+budgetNote:[...message.content,{type:'text' as const,text:budgetNote}]}:message)};
      if(options.streamFn)return options.streamFn(m,context,streamOptions);
      return stream(model,context,{...streamOptions,apiKey:cfg.apiKey.trim(),fetch:f,maxTokens:AGENT_LIMITS.outputPerTurn,maxRetries:0,timeoutMs:AGENT_LIMITS.idleTimeoutMs,
        onProviderStreamEvent:()=>{firstData();emit(activity.title);},onResponse:()=>emit(`第 ${calls} 轮：服务已响应，正在接收`) });
    },
    beforeToolCall:async({toolCall})=>{check();if(runner.hasQueuedMessages())return {block:true,reason:'用户补充了新指令，请先读取并按最新要求重新决定操作',terminate:true};if(questionOnly&&['edit_scene','configure_animation','submit_preview'].includes(toolCall.name))return {block:true,reason:'用户当前选择只提问，请直接回答，不要修改或提交场景',terminate:true};if(seenCalls.has(toolCall.id))return {block:true,reason:'重复的工具调用ID已拒绝，避免重复修改'};seenCalls.add(toolCall.id);if(submitted)return {block:true,reason:'本轮已提交预览',terminate:true};if(pauseReason)return {block:true,reason:pauseReason,terminate:true};activity.toolCalls++;return undefined;},
    finishTurn:async({message})=>{
      if(runner.hasQueuedMessages()){submitted=false;pauseReason='';stagnantTurns=0;failedTurns=0;return {action:'continue'};}
      if(submitted)return {action:'end'};
      const answeredSteering=(respondingToSteering||questionOnly)&&message.stopReason==='stop'&&!message.content.some(c=>c.type==='toolCall');respondingToSteering=false;
      if(answeredSteering)return {action:'end'};
      emit(`第${calls}轮执行：${turnActions.join(' → ')||'仅文字回复'}；${progressVersion===observedProgress?'无新的有效进展':'有有效进展'}；${draft.animation?'已有动画配置':'尚无动画配置'}`,true);
      const noProgress=progressVersion===observedProgress;failedTurns=turnErrors.length&&noProgress?failedTurns+1:0;
      stagnantTurns=noProgress?stagnantTurns+1:0;observedProgress=progressVersion;
      if(failedTurns>=AGENT_LIMITS.consecutiveErrorTurns)pauseReason='连续3轮工具调用失败且无有效进展，已暂停；原始错误已保留';
      if(!pauseReason&&stagnantTurns>=AGENT_LIMITS.noProgressTurns)pauseReason='连续4轮没有有效建模或复核进展，已暂停以避免空转';
      if(pauseReason){emit(pauseReason,true);return {action:'end'};}
      return operations.length||(wantsAnimation&&activity.plan.length)?{action:'continue'}:undefined;
    },
  });
  const abort=()=>runner.abort();signal?.addEventListener('abort',abort,{once:true});
  const unsubscribe=runner.subscribe(event=>{
    if(signal?.aborted)return;
    if(event.type==='message_end'&&event.message.role==='user'){const guide=steeringMessages.get(event.message.timestamp);if(guide){respondingToSteering=true;questionOnly=guide.mode==='question';userTexts.push(guide.text);if(!questionOnly){executionTexts.push(guide.text);requirementsNeedRefresh=requirements.length>0;}steeringMessages.delete(event.message.timestamp);options.onSteeringApplied?.(guide.id);emit('已接收补充要求，正在按最新指令调整',true);}}
    if(event.type==='tool_execution_start'){const readArgs=event.args as {assemblyId?:string;nodeIds?:string[]};const readLabel=readArgs.assemblyId?'组件:'+(draft.nodes.find(n=>n.assemblyId===readArgs.assemblyId)?.assemblyName??readArgs.assemblyId):readArgs.nodeIds?'节点:'+readArgs.nodeIds.map(id=>draft.nodes.find(n=>n.id===id)?.name??id).join(',').slice(0,120):'总览';turnActions.push(event.toolName+(event.toolName==='read_scene'?`(${readLabel})`:''));const label=tools.find(t=>t.name===event.toolName)?.label??event.toolName;activity.timings=[...activity.timings,{id:event.toolCallId,kind:'tool',label,detail:event.toolName==='read_scene'?readLabel:typeof (event.args as {summary?:unknown}).summary==='string'?String((event.args as {summary:string}).summary).slice(0,300):undefined,startedAt:Date.now()}];emit(`正在${label}`);}
    if(event.type==='tool_execution_end'){const result=event.result as {content?:{type:string;text?:string}[]};const detail=event.isError?(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join(' ').split('Received arguments:')[0].slice(0,500):undefined;stamp(event.toolCallId,{endedAt:Date.now(),failed:event.isError,...(detail?{detail}:{})});emit(activity.title);}
    if(event.type==='tool_execution_end'){
      if(event.isError){
        const result=event.result as {content?:{type:string;text?:string}[]};
        const detail=(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join(' ').split('Received arguments:')[0].slice(0,700);
        if(detail!==pauseReason){lastToolError=`${event.toolName}：${detail}`;turnErrors.push(lastToolError);if(!rootToolErrors.includes(lastToolError)){rootToolErrors.push(lastToolError);if(rootToolErrors.length>3)rootToolErrors.shift();}}
        emit(`工具失败：${event.toolName}${detail?'：'+detail:''}`,true);
      }
    }
    if(event.type==='message_update'){
      const e=event.assistantMessageEvent;
      if(e.type==='text_delta'||e.type==='toolcall_delta'){
        firstData();
        activity.characters+=e.delta.length;emit(e.type==='toolcall_delta'?'正在接收建模工具参数':'正在接收模型回复');
      }
    }
    if(event.type==='message_end' && event.message.role==='assistant'){
      const usage=event.message.usage;
      stamp(`model-${calls}`,{endedAt:Date.now(),inputTokens:usage?.input,outputTokens:usage?.output});
      if(usage && usage.totalTokens>0){activity.usageReported=true;activity.inputTokens+=usage.input+usage.cacheRead+usage.cacheWrite;activity.outputTokens+=usage.output;}
      emit(activity.title);
    }
  });
  try {
    check();
    options.onControl?.({steer:(id,text,images=[],mode='guide')=>{
      if(!acceptingSteering||signal?.aborted||submitted||pauseReason)return false;
      const content=[{type:'text' as const,text:(mode==='question'?'用户要求先回答这个问题，本轮禁止修改场景、动画或提交；可读取场景，回答后保留现有草稿暂停。':'')+'用户在执行中补充要求（与之前冲突时按这条最新要求执行；先回答问题或修正计划，保留有效草稿）：'+text},...images.map(asImage)];
      const timestamp=++steeringTimestamp;steeringMessages.set(timestamp,{id,text,mode});
      if(/不要|取消|无需/.test(text)&&/动画|动作/.test(text))wantsAnimation=false;else if(/动画|动作|动起来|运动/.test(text))wantsAnimation=true;
      runner.steer({role:'user',content,timestamp});
      emit('收到补充要求，将在当前操作结束后调整',true);return true;
    }});
    await runner.prompt(options.text||'请根据参考图建模',(options.images??[]).map(asImage));check();
    const last=[...runner.state.messages].reverse().find(m=>m.role==='assistant');
    if(last?.role==='assistant' && (last.stopReason==='error'||last.stopReason==='aborted'))throw new Error(transportFailure||last.errorMessage||'模型服务未完成请求，请检查工具调用兼容性');
    if(operations.length&&!submitted){emit('本轮结束，已保留未完成阶段草稿',true);return checkpoint(pauseReason?(pauseReason+'\n原始工具错误：'+rootToolErrors.join('；')):last?.role==='assistant'&&last.stopReason==='stop'&&last.content.some(c=>c.type==='text')?last.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'本轮未完成“最新截图→复核→提交”，没有自动修改正式场景。');}
    if(!operations.length && pauseReason)throw new Error(pauseReason+'\n最近执行：'+activity.events.filter(e=>/^第\d+轮执行/.test(e)).slice(-4).join('；')+(rootToolErrors.length?'\n原始工具错误：'+rootToolErrors.join('；'):''));
    if(!operations.length){summary=last?.role==='assistant'?last.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';if(!summary.trim())throw new Error(lastToolError?'工具调用未完成：'+lastToolError:'模型未返回有效回复，请检查模型工具调用支持');
      if(summary.trim().startsWith('{') && summary.includes('\"operations\"'))throw new Error('模型输出了普通JSON而未调用建模工具。请检查网关的工具调用支持，或在模型配置切回单次生成');}
    return {batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:options.selection,editScope:options.editScope,summary,operations,...((requirementsNeedRefresh||activity.requirements?.items.some(r=>r.status!=='pass'))?{incomplete:true,continuation:'继续核对并完成：'+executionTexts.join('；')}:{})},result:{doc:draft,applied,errors:[]},activity};
  } catch(error) {
    if(operations.length && !signal?.aborted){emit('任务中断，已保留阶段草稿',true);return checkpoint(error instanceof Error?error.message:'模型请求中断');}
    throw error;
  } finally {acceptingSteering=false;options.onControl?.(null);unsubscribe();signal?.removeEventListener('abort',abort);}
}
