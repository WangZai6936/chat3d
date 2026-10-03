import {inspectContactSurfaces} from '../domain/contactQuality';
import {surfaceBatchCommands} from '../domain/surfaceBatch';
import {projectMeshUV} from '../domain/uvProjection';
import {SURFACE_PRESETS} from '../domain/textures';
import {alignmentOffset,connectionReport,localPoint} from '../domain/connections';
import {findSceneParts} from '../domain/sceneQuery';
import {DETAIL_CRITERIA,detailTargets,validateDetailReview,evaluateDetailAcceptance,type DetailReview,type DetailAcceptance} from '../domain/detailAcceptance';
import {MESH_CATALOG,loadMeshComponent} from '../scene/meshCatalog';
import {processRoute} from '../domain/processMotion';
import {industrialRecipe,RECIPE_NAMES} from '../domain/industrialRecipes';
import {quickEdit} from '../domain/quickEdit';
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
import { captureSceneBatch, captureScene, isSceneCaptureAvailable, type CaptureView } from '../scene/capture';
import {checkEditScope,type EditScope} from '../domain/editScope';
import { makeId } from '../util/ids';

import { AGENT_LIMITS } from './agentPolicy';
import { normalizeModelingRequestMessages } from './modelingRequest';
export { AGENT_LIMITS } from './agentPolicy';
export interface ActivityTiming { id:string; kind:'model'|'tool'; label:string; startedAt:number; firstDataAt?:number; endedAt?:number; failed?:boolean; detail?:string; inputTokens?:number; outputTokens?:number }
export interface DesignBrief {flow:string[];layout:string;equipment:{name:string;count:number;features:string[]}[];checks:string[];composition?:CompositionPlan}
export interface AgentActivity {
  detailAcceptance?:DetailAcceptance;
  explanations?:{id:string;text:string}[];
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
  qualityBaseline?:SceneDocument;
  text: string; config: ModelConfig; document: SceneDocument; selection: string[];
  images?: string[]; history?: ConversationTurn[]; signal?: AbortSignal; editScope?:EditScope;
  onActivity?: (activity: AgentActivity) => void;
  onPreview?: (doc: SceneDocument) => void;
  onCheckpoint?: (result: AgentResult) => void;
  onControl?: (control:AgentControl|null) => void;
  onSteeringApplied?: (id:string) => void;
  // Dependency injection for automated checks; production uses Pi's OpenAI-compatible adapter.
  streamFn?: StreamFn;
  captureAvailable?: () => boolean;
  capture?: (doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number,signal?:AbortSignal) => Promise<string>;
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
function materialContext(m:SceneDocument['materials'][number]){const {maps,...rest}=m;return {...rest,...(maps?{textureChannels:Object.keys(maps)}:{})};}
function agentSceneContext(doc:SceneDocument,selection:string[],assemblyId?:string,editScope?:EditScope){
 const byId=new Map(doc.nodes.map(n=>[n.id,n])),selected=new Set(selection),full=new Set(selectedAssemblies(doc,selection));
 const counts=new Map<string,number>(),anchors=new Map<string,string>();for(const n of doc.nodes)if(n.assemblyId){counts.set(n.assemblyId,(counts.get(n.assemblyId)??0)+1);if(!anchors.has(n.assemblyId)||n.id===n.assemblyId)anchors.set(n.assemblyId,n.id);}
 const used=new Set(doc.nodes.map(n=>n.materialId));
 const detail={...buildSceneContext(doc,selection,editScope),materials:doc.materials.filter(m=>used.has(m.id)).map(materialContext)};
 if(assemblyId){const nodes=detail.nodes.filter(n=>byId.get(n.id)?.assemblyId===assemblyId);const used=new Set(nodes.map(n=>n.materialId));return {...detail,materials:detail.materials.filter(m=>used.has(m.id)),nodes};}
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
  const sceneReads=new Set(['read_scene','find_scene_parts']);
  const sceneEdits=new Set(['edit_scene','configure_animation','configure_process_route','add_reference_component','add_mesh_component','add_mesh_components','connect_scene_parts','remove_connection','set_surface_detail','set_surfaces_batch','prepare_surface_uv','move_components']);
  let latestScene=-1, latestEdit=-1, latestInspection=-1, latestAudit=-1, latestCaptureRevision='',latestCaptureScope='';
  const auditedScopes=new Set<string>();
  for(let i=0;i<messages.length;i++) {
    const m=messages[i];
    if(m.role!=='toolResult'||m.isError)continue;
    if(sceneReads.has(m.toolName)||sceneEdits.has(m.toolName))latestScene=i;
    if(sceneEdits.has(m.toolName))latestEdit=i;
    if(m.toolName==='inspect_scene')latestInspection=i;
    if(m.toolName==='audit_model_detail'){latestAudit=i;const d=m.details as {componentId?:string}|undefined;if(d?.componentId)auditedScopes.add(d.componentId);}
    if((m.toolName==='capture_view'||m.toolName==='capture_multiview')) {
      const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      latestCaptureRevision=/revision=(\d+)/.exec(text)?.[1]??'';latestCaptureScope=/scope=([^\s]+)/.exec(text)?.[1]??'';
    }
  }
  // Keep the latest detailed read of EACH scope at the current revision.
  // Reading component B must not erase component A's part IDs before a multi-object edit.
  let currentRevision=-1;const scopedReads=new Map<string,number>();
  for(const m of messages)if(m.role==='toolResult'&&!m.isError){const d=m.details as {revision?:number}|undefined;if(typeof d?.revision==='number')currentRevision=Math.max(currentRevision,d.revision);}
  for(let i=0;i<messages.length;i++){const m=messages[i];if(m.role==='toolResult'&&sceneReads.has(m.toolName)&&!m.isError){const d=m.details as {revision?:number;scopeKey?:string;snapshot?:boolean}|undefined;if(d?.revision===currentRevision&&d.snapshot&&d.scopeKey)scopedReads.set(d.scopeKey,i);}}
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
    if(m.toolName==='audit_model_detail'&&i!==latestAudit)return {...m,content:[{type:'text' as const,text:'此前细节检查已归入最新验收报告，原始记录保留。'}]};
    if(sceneReads.has(m.toolName)&&retainedReads.has(i)&&i!==latestScene){const raw=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');if(raw.length>8000){try{const data=JSON.parse(raw);if(data.nodes)return {...m,content:[{type:'text' as const,text:JSON.stringify({revision:data.revision,scopeKey:data.scopeKey,detailOmitted:true,nodes:data.nodes.map((n:any)=>({id:n.id,name:n.name,position:n.position,rotationQuaternion:n.rotationQuaternion,scale:n.scale,materialId:n.materialId})),next:'部件ID与变换仍有效；需精确形状时用read_scene({nodeIds:[目标ID]})，仅取正在修改的部件。'})}]};}catch{}}}
    if(m.toolName==='inspect_scene'&&i!==latestInspection)return {...m,content:[{type:'text' as const,text:'历史场景检查已省略，请以最新检查和当前几何为准。'}]};
    if((sceneReads.has(m.toolName)||sceneEdits.has(m.toolName))&&i!==latestScene&&i!==latestEdit&&!retainedReads.has(i))
      return {...m,content:[{type:'text' as const,text:'该历史场景快照已由后续成功操作更新。请以最新场景工具结果为准；本工具执行成功。'}]};
    if((m.toolName==='capture_view'||m.toolName==='capture_multiview')&&latestCaptureRevision) {
      const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      const scope=/scope=([^\s]+)/.exec(text)?.[1]??'';
      if(/revision=(\d+)/.exec(text)?.[1]!==latestCaptureRevision||(scope!==latestCaptureScope&&auditedScopes.has(scope)))
        return {...m,content:[{type:'text' as const,text:'历史版本截图已省略。请检查最新版本截图；原始参考图保持不变。'}]};
    }
    return m;
  }).filter(m=>!(m.role==='toolResult'&&paired.has(m.toolCallId)));
}

export async function runModelingAgent(options: AgentOptions): Promise<AgentResult> {
  const { config:cfg, signal }=options;
  if(signal?.aborted) throw new DOMException('已停止','AbortError');
  const direct=!options.images?.length?quickEdit(options.text,options.document,options.selection,options.editScope):null;
  if(direct){
    const now=Date.now();const activity:AgentActivity={title:'明确编辑 · 本地执行（0 Token）',explanations:[{id:'local-edit',text:'目标和修改要求明确，已直接校验并完成这项编辑，保留其他场景内容。请查看预览后确认。'}],turn:0,toolCalls:0,characters:0,inputTokens:0,outputTokens:0,usageReported:true,lastEventAt:now,plan:[],events:['明确目标和单项指令通过本地数据及范围校验；未请求模型，仍需确认预览。'],timings:[{id:'direct',kind:'tool',label:'本地明确编辑',startedAt:now,endedAt:now}]};
    options.onActivity?.(activity);options.onPreview?.(direct.result.doc);return {...direct,activity};
  }
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
  let detailReviews:DetailReview[]=[];
  const qualityBase=structuredClone(options.qualityBaseline??base);
  const refreshDetail=()=>{activity.detailAcceptance=evaluateDetailAcceptance(qualityBase,draft,detailReviews);return activity.detailAcceptance;};
  let visualFailure='',stageReason='';
  const visualAvailable=()=>!visualFailure&&(options.captureAvailable?.()??(options.capture?true:isSceneCaptureAvailable()));
  const unavailableStage=()=>{stageReason='三维视图不可用，已确定性结束本轮；'+(operations.length?'阶段草稿已保留，未经视觉验收，可手动确认或继续修改。':'本轮未修改场景，也未完成视觉验收。')+(visualFailure?' 截图错误：'+visualFailure:'');return stageReason;};
  const captureDraft=async(view:CaptureView,targetIds?:string[],time?:number)=>{
    if(!visualAvailable())throw new Error(unavailableStage());
    try{return await (options.capture??captureScene)(draft,view,targetIds,time,signal);}
    catch(error){if(signal?.aborted)throw error;visualFailure=error instanceof Error?error.message:'截图失败';throw new Error(unavailableStage());}
  };
  let activity: AgentActivity={title:'准备 Pi 建模任务',turn:0,toolCalls:0,characters:0,inputTokens:0,outputTokens:0,usageReported:false,lastEventAt:Date.now(),plan:[],events:[],timings:[]};
  const emit=(title:string,record=false) => {
    activity={...activity,title,lastEventAt:Date.now(),events:record?[...activity.events,title].slice(-30):activity.events};
    options.onActivity?.({...activity,plan:[...activity.plan],events:[...activity.events],timings:activity.timings.map(t=>({...t}))});
  };
  const checkpoint=(reason='任务尚未完成') : AgentResult => ({
    batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:[...options.selection],editScope:options.editScope,
      incomplete:true,continuation:`继续完成原任务：${executionTexts.join('；补充：') || '根据参考图建模'}。当前场景是已保留的阶段成果，先检查现有对象，保留有效部分，不要重复创建；优先完成下一阶段。${visualAvailable()?'三维可用时截图复核。':'三维不可用，先保留数据修改；恢复视图后再做视觉验收，不要反复请求截图。'}`,
      summary:`阶段草稿已保留（未完成最终复核）\n${reason}\n已执行 ${operations.length} 项操作，当前 ${draft.nodes.length} 个对象。请人工检查后保留此阶段，或放弃。`+(reviewIssues.length?'\n已知问题：'+reviewIssues.join('；'):''),operations:structuredClone(operations)},
    result:{doc:structuredClone(draft),applied:structuredClone(applied),errors:[]},activity:structuredClone(activity)
  });
  const stamp=(id:string,patch:Partial<ActivityTiming>)=>{activity.timings=activity.timings.map(t=>t.id===id?{...t,...patch}:t);};
  const firstData=()=>{const t=activity.timings.find(t=>t.id===`model-${calls}`);if(t && t.firstDataAt===undefined)stamp(t.id,{firstDataAt:Date.now()});};
  const check=() => {if(signal?.aborted)throw new DOMException('已停止','AbortError');};
  const tool=<T extends TSchema>(name:string,label:string,description:string,parameters:T,execute:AgentTool<T>['execute']):AgentTool<any>=>({name,label,description,parameters,executionMode:'sequential',execute:execute as AgentTool['execute']});
  const commitEdits=async(args:{summary:string;operations:Command[]})=>{
      check();if(needsDesign&&!activity.plan.length)throw new Error('完整新场景请先调用 plan_model 说明建模步骤');
      if(submitted)throw new Error('已提交预览，本轮不能继续修改');
      const result=applyBatch(draft,{operations:args.operations});
      if(result.errors.length)throw new Error(result.errors.map(e=>e.message).join('；'));
      const scopeErrors=checkEditScope(base,result.doc,options.editScope);if(scopeErrors.length)throw new Error(scopeErrors.join('；'));
      const errors=validateDocument(result.doc);if(errors.length)throw new Error(errors.map(e=>e.message).join('；'));
      check();
      const changed=JSON.stringify(draft.nodes)!==JSON.stringify(result.doc.nodes)||JSON.stringify(draft.materials)!==JSON.stringify(result.doc.materials)||JSON.stringify(draft.animation)!==JSON.stringify(result.doc.animation);
      if(!changed)throw new Error('本次操作未改变场景，请执行计划中的有效修改或复核提交');
      progress();
      const oldRevision=draft.revision,sameVisual=visualFingerprint(draft)===visualFingerprint(result.doc);
      draft=result.doc;refreshDetail();if(requirements.length)activity.requirements=checkRequirements(draft,requirements);applied.push(...result.applied);operations.push(...args.operations);
      if(sameVisual){if(capturedRevision===oldRevision)capturedRevision=draft.revision;if(reviewedRevision===oldRevision)reviewedRevision=draft.revision;if(reviewedWholeRevision===oldRevision)reviewedWholeRevision=draft.revision;if(animationCheckedRevision===oldRevision)animationCheckedRevision=draft.revision;}else reviewedRevision=-1;
      options.onCheckpoint?.(checkpoint());options.onPreview?.(draft);emit(`草稿已更新：${args.summary}（共 ${draft.nodes.length} 个对象）`,true);
      return {...textResult(JSON.stringify({revision:draft.revision,scene:agentSceneContext(draft,selectionForDoc(draft),undefined,options.editScope),review:reviewRequirement(base,draft),next:visualAvailable()?'按实际修改复核：none无需截图可提交；local可用受影响组件近景；whole需全景；animation需动态样本。截图后下一轮review_model。完成用户要求即可提交，不要追加无关工序。':'三维不可用。继续完成用户要求的全部数据编辑和数量/尺寸检查；不要遗漏其他对象。完成后调用submit_data_preview保留未视觉验收草稿，不要请求截图。'})),details:{revision:draft.revision}};
  };
  const tools: AgentTool<any>[]=[
    tool('detail_quality_standard','读取通用细节验收标准','适用于任何单独模型和完整场景，不限工业或已有网格。返回六项标准及本轮新增/改结构对象。按用途具体化，不以零件数当质量。无截图时只能待核对；有未达标项应先修正。',Type.Object({}),async()=>textResult(JSON.stringify({criteria:DETAIL_CRITERIA,acceptance:refreshDetail(),instruction:'先完成全部结构，再按每个目标的近景核对六项；无近景时保留未验收状态。现成网格也不豁免。'}))),
    tool('audit_model_detail','记录对象细节验收','逐对象记录六项验收，componentId用detail_quality_standard返回的真实ID，nodeIds引用当前组件内真实部件。pass必须有当前版本至少两个不同近景视角（优先capture_multiview）且在截图返回的下一轮调用。fail需说明待修正，unknown如实保留，not_applicable说明对象用途为何不需要；外形与细节不能跳过。自检不是人工验收。',Type.Object({componentId:Type.String(),checks:Type.Array(Type.Object({criterion:Type.Union(DETAIL_CRITERIA.map(c=>Type.Literal(c.key))),status:Type.Union(['pass','fail','unknown','not_applicable'].map(x=>Type.Literal(x))),evidence:Type.String({minLength:5,maxLength:600}),nodeIds:Type.Array(Type.String(),{maxItems:16})}),{minItems:6,maxItems:6})}),async(_id,args)=>{check();const targets=detailTargets(qualityBase,draft);if(!targets.some(t=>t.id===args.componentId))throw Error('目标不在本轮细节验收范围');const closeup=new Set([...capturedViews].filter(key=>key.startsWith(draft.revision+':')&&key.endsWith(':'+args.componentId)).map(key=>key.split(':')[1])).size>=2;const singleWhole=targets.length===1&&new Set([...capturedViews].filter(key=>key.startsWith(draft.revision+':')&&key.endsWith(':whole')).map(key=>key.split(':')[1])).size>=2&&new Set(draft.nodes.filter(n=>n.visible).map(n=>n.assemblyId??n.id)).size===1;const review:DetailReview={...args,revision:draft.revision,visualEvidence:visualAvailable()&&calls>capturedTurn&&(closeup||singleWhole)};const errors=validateDetailReview(draft,review);if(errors.length)throw Error(errors.join('；'));detailReviews=[...detailReviews.filter(r=>r.componentId!==args.componentId),review];progress();const report=refreshDetail();emit('已记录对象细节检查；'+report.issues.length+'项未验收',true);return {...textResult(JSON.stringify({revision:report.revision,status:report.status,review,remaining:report.issues})),details:{revision:draft.revision,componentId:args.componentId}};}),
    tool('prepare_surface_uv','建立网格投影UV','为缺少UV的现有网格生成平面、圆柱或按面法线分割的盒投影。盒投影适合多面外壳但会产生接缝。按当前世界轴投影并烘焙到网格，不改变形状或位置。仅为基础投影，复杂角色/多面资产仍需专门UV展开和逐面检查，不能冒称无拉伸。axis是平面的法向或圆柱轴，默认Y。',Type.Object({targetId:Type.String(),mode:Type.Union([Type.Literal('planar'),Type.Literal('cylindrical'),Type.Literal('box')]),axis:Type.Optional(Type.Union([Type.Literal('x'),Type.Literal('y'),Type.Literal('z')]))}),async(_id,args)=>{const node=draft.nodes.find(n=>n.id===args.targetId);if(!node)throw Error('目标部件不存在');return commitEdits({summary:'建立表面UV投影',operations:[{op:'updateParameters',targetId:node.id,geometry:projectMeshUV(node,args.mode,args.axis)}]});}),
    tool('set_surface_detail','设置材质表面细节','为选定部件增加可导出的程序化法线/粗糙度细节：拉丝金属、喷粉、橡胶、布料、木纹或混凝土。保留原颜色与材质参数，替换已有法线/粗糙度贴图；不把整机玻璃和人体一并刷成金属。repeat为UV重复次数，strength为0–1；先按材质筛选真实部件。表面纹理不是几何细节的替代。',Type.Object({targetId:Type.String(),preset:Type.Union(SURFACE_PRESETS.map(x=>Type.Literal(x))),repeat:Type.Tuple([Type.Number({exclusiveMinimum:0,maximum:100}),Type.Number({exclusiveMinimum:0,maximum:100})]),strength:Type.Number({minimum:0,maximum:1}),scope:Type.Optional(Type.Literal('assembly')),sourceMaterialIds:Type.Optional(Type.Array(Type.String(),{maxItems:20}))}),async(_id,args)=>{const {targetId,scope,sourceMaterialIds,...surface}=args;return commitEdits({summary:'增加材质表面细节',operations:[{op:'setSurface',targetId,scope,sourceMaterialIds,surface}]});}),
    tool('set_surfaces_batch','批量处理材质与缺失UV','为1–32个真实部件一次处理表面。先find_scene_parts确认材质和UV，仅选择确实需要的零件。缺UV时可明确uvIfMissing基础投影；已有UV保持不变。全部成功才提交，不会部分修改。基础投影仍需检查接缝/拉伸，不能宣称专业展开。',Type.Object({items:Type.Array(Type.Object({targetId:Type.String(),surface:Type.Object({preset:Type.Union(SURFACE_PRESETS.map(x=>Type.Literal(x))),repeat:Type.Tuple([Type.Number({exclusiveMinimum:0,maximum:100}),Type.Number({exclusiveMinimum:0,maximum:100})]),strength:Type.Number({minimum:0,maximum:1})}),uvIfMissing:Type.Optional(Type.Object({mode:Type.Union([Type.Literal('planar'),Type.Literal('cylindrical'),Type.Literal('box')]),axis:Type.Optional(Type.Union([Type.Literal('x'),Type.Literal('y'),Type.Literal('z')]))}))}),{minItems:1,maxItems:32})}),async(_id,args)=>commitEdits({summary:'批量处理表面及缺失UV',operations:surfaceBatchCommands(draft,args.items)})),
    tool('connect_scene_parts','记录或对齐对象连接','sourceId为来源部件、targetId为目标部件，sourcePoint/targetPoint为接触点；coordinateSpace默认local，也可明确world由工具转换。需根据实际几何表面选择，不能以包围盒中心冒充接触面。maxDistance为允许间距米。align=true将来源所在整个组件平移使两点重合，不旋转、不做骨骼姿态/碰撞修复。先核对朝向、局部点和编辑范围；默认只记录关系。以后对象移动时inspect_scene会检查是否分离。',Type.Object({sourceId:Type.String(),targetId:Type.String(),sourcePoint:Type.Tuple([Type.Number(),Type.Number(),Type.Number()]),targetPoint:Type.Tuple([Type.Number(),Type.Number(),Type.Number()]),maxDistance:Type.Number({exclusiveMinimum:0,maximum:10}),purpose:Type.String({minLength:1,maxLength:160}),coordinateSpace:Type.Optional(Type.Union([Type.Literal('local'),Type.Literal('world')])),align:Type.Optional(Type.Boolean())}),async(_id,args)=>{const {sourceId,align,coordinateSpace,...connection}=args;if(coordinateSpace==='world'){const source=draft.nodes.find(n=>n.id===sourceId),target=draft.nodes.find(n=>n.id===connection.targetId);if(!source||!target)throw Error('连接对象不存在');connection.sourcePoint=localPoint(source,connection.sourcePoint);connection.targetPoint=localPoint(target,connection.targetPoint);}const ops:Command[]=[];if(align)ops.push({op:'translateAssembly',targetId:sourceId,value:alignmentOffset(draft,sourceId,connection)});ops.push({op:'setConnection',targetId:sourceId,connection});return commitEdits({summary:'记录连接：'+connection.purpose,operations:ops});}),
    tool('inspect_connections','检查对象连接','按最新变换测量已登记接触点的间距；只说明点距离，不等于工艺、姿态或碰撞验收。',Type.Object({}),async()=>textResult(JSON.stringify(connectionReport(draft)))),
    tool('inspect_contact_surfaces','检查接触点是否落在表面','检查登记点到真实三角面的最近距离，识别两点重合却藏在物体中心的错误连接。sourceIds可限定来源部件；超出计算预算为unknown。结果不代表全模型碰撞检测，不能宣称没有穿模。',Type.Object({sourceIds:Type.Optional(Type.Array(Type.String(),{maxItems:32}))}),async(_id,args)=>textResult(JSON.stringify(inspectContactSurfaces(draft,args.sourceIds)))),
    tool('remove_connection','解除对象连接','解除sourceId部件登记的连接，不移动或删除对象。删除被关联目标前需先明确解除关系。',Type.Object({sourceId:Type.String()}),async(_id,args)=>commitEdits({summary:'解除连接',operations:[{op:'setConnection',targetId:args.sourceId,connection:null}]})),
    tool('move_components','批量平移组件','移动一个或多个现有组件，targetId用其任意真实部件ID。delta是世界坐标位移增量（米），不是绝对目标点；每个组件只能出现一次，保留朝向/尺寸。需要旋转用transformAssembly。',Type.Object({items:Type.Array(Type.Object({targetId:Type.String(),delta:Type.Tuple([Type.Number(),Type.Number(),Type.Number()])}),{minItems:1,maxItems:16})}),async(_id,args)=>{const groups=new Set<string>();for(const item of args.items){const n=draft.nodes.find(n=>n.id===item.targetId);if(!n)throw Error('移动目标不存在');const id=n.assemblyId??n.id;if(groups.has(id))throw Error('同一组件在一批中只能平移一次');groups.add(id);}return commitEdits({summary:'批量调整组件位置',operations:args.items.map(item=>({op:'translateAssembly',targetId:item.targetId,value:item.delta}))});}),
    tool('find_scene_parts','定位需要的部件','用名称关键词查询真实部件ID、变换和世界包围盒，不读取全部组件。terms为匹配任意一个关键词；空词返回分页。优先用此工具找到控制台/手/接口/门/主轴等局部目标。返回的中心是包围盒中心，不保证是接触面。',Type.Object({assemblyId:Type.Optional(Type.String()),terms:Type.Optional(Type.Array(Type.String({maxLength:80}),{maxItems:12})),offset:Type.Optional(Type.Integer({minimum:0,maximum:10000})),limit:Type.Optional(Type.Integer({minimum:1,maximum:48}))}),async(_id,args)=>{check();const scopeKey='parts:'+JSON.stringify(args);if(readRevision!==draft.revision){readRevision=draft.revision;preparationReads=0;readScopes.clear();}if(!readScopes.has(scopeKey)&&preparationReads<24){readScopes.add(scopeKey);preparationReads++;progress();}return {...textResult(JSON.stringify(findSceneParts(draft,args))),details:{revision:draft.revision,scopeKey,snapshot:true}};}),
    tool('add_mesh_components','批量放置精细模型','批量添加独立组件，减少逐个生成和重复读取；每个组件独立命名/定位/分类，单批1–16项。全部载入和校验成功才更新草稿，任一失败整批不生效。需要读取结果ID后再操作人物接触关系。',Type.Object({items:Type.Array(Type.Object({key:Type.Union(MESH_CATALOG.map(x=>Type.Literal(x.key))),name:Type.String({minLength:1,maxLength:80}),position:Type.Tuple([Type.Number(),Type.Number(),Type.Number()]),yaw:Type.Optional(Type.Number()),scaleFactor:Type.Optional(Type.Number({minimum:.1,maximum:10})),planKey:Type.Optional(Type.String({maxLength:120})),zone:Type.Optional(Type.String({maxLength:120}))}),{minItems:1,maxItems:16})}),async(_id,args)=>{check();const ops:Command[]=[];for(const item of args.items){const component=await loadMeshComponent(item,signal);check();ops.push({op:'importMeshComponent',...component});}return commitEdits({summary:'批量放置'+args.items.length+'个精细组件',operations:ops});}),
    tool('list_mesh_components','查看精细模型目录','返回经离线建模的可编辑网格组件：七类机加工设备和四类人员等。只返回结构、尺寸、朝向和适用范围，不返回顶点。优先使用匹配组件作为结构起点，禁止冒称厂家精确模型或把不同设备强行套成同一种。',Type.Object({}),async()=>textResult(JSON.stringify(MESH_CATALOG))),
    tool('add_mesh_component','放置精细模型','仅单个对象使用，多对象优先add_mesh_components。按目录key放置分部件精细网格；position为局部原点的世界米坐标，yaw为绕Y轴角度，scaleFactor为统一比例。人员默认面向-Z，机床操作面朝+Z，应面对设备并将手对准实际操作区。返回实际组件和节点ID，可用现有组件命令移动/复制/改材质/修改子部件变换/添加几何细节。不接受远程URL或模型自行编造的顶点。',Type.Object({key:Type.Union(MESH_CATALOG.map(x=>Type.Literal(x.key))),name:Type.String({minLength:1,maxLength:80}),position:Type.Tuple([Type.Number(),Type.Number(),Type.Number()]),yaw:Type.Optional(Type.Number()),scaleFactor:Type.Optional(Type.Number({minimum:.1,maximum:10})),planKey:Type.Optional(Type.String({maxLength:120})),zone:Type.Optional(Type.String({maxLength:120}))}),async(_id,args)=>{check();const component=await loadMeshComponent(args,signal);check();return commitEdits({summary:'放置精细模型：'+args.name,operations:[{op:'importMeshComponent',...component}]});}),
    tool('configure_process_route','配置业务路线','为AGV、输送物料或人员生成有停留的路径动画；作用于targetId所在整个组件。offsets是相对初始位置的位移点，以[0,0,0]开始，速度米/秒。carryIds可绑定实际载物零件跟随，不会自动抓取或做碰撞避让。保留其他轨道；延长路线会延长总体循环周期，必须符合用户节拍要求。直接生成并写入草稿，再按能力进行动态复核。',Type.Object({targetId:Type.String(),offsets:Type.Array(Type.Array(Type.Number(),{minItems:3,maxItems:3}),{minItems:2,maxItems:16}),speed:Type.Number({minimum:.01,maximum:5}),dwell:Type.Number({minimum:0,maximum:60}),returnToStart:Type.Boolean(),carryIds:Type.Optional(Type.Array(Type.String(),{maxItems:100}))}),async(id,args)=>{const animation=processRoute(draft,args as import('../domain/processMotion').ProcessRoute);return tools.find(t=>t.name==='edit_scene')!.execute(id,{summary:'配置业务路线与停留',operations:[{op:'setAnimation',animation}]},signal,()=>{});}),
    tool('add_reference_component','添加结构参考组件','仅当用户需要此类对象且参考结构合适时使用；不替代参考图定制设备。添加可继续逐零件修改的人员、空腔机壳、货架或AGV。名称由用户场景决定，position为落地点米坐标，yaw为绕Y角度。返回真实对象ID，可再按尺寸与工艺改造。不是厂家模型或完整产线模板。',Type.Object({kind:Type.Union(RECIPE_NAMES.map(k=>Type.Literal(k))),name:Type.String({minLength:1,maxLength:80}),position:Type.Tuple([Type.Number(),Type.Number(),Type.Number()]),yaw:Type.Optional(Type.Number())}),async(id,args)=>{const def=industrialRecipe(args.kind);return tools.find(t=>t.name==='edit_scene')!.execute(id,{summary:'添加可编辑参考组件：'+args.name,operations:[{op:'createAssembly',...def,name:args.name,position:args.position,yaw:args.yaw??0}]},signal,()=>{});}),
    tool('submit_data_preview','保留数据草稿','仅在真实渲染不可用时使用。完成全部请求的数据编辑、数量和尺寸检查后，一次性保留未经视觉验收的阶段草稿。不能把计划未完成的对象说成完成；summary明确完成和剩余部分。不会写入正式项目。',Type.Object({summary:Type.String({minLength:1,maxLength:600})}),async(_id,args)=>{check();if(visualAvailable())throw Error('三维可用，请完成正常视觉复核后提交');const audit=refreshDetail();stageReason=args.summary+'\n'+(audit.issues.length?'细节验收未完成：'+audit.issues.slice(0,12).join('；')+'\n':'')+unavailableStage();emit(stageReason,true);return {...textResult(stageReason),terminate:true};}),
    tool('read_component_recipe','读取可编辑结构参考','可选的结构参考，不自动创建模型，不替代用户参考图。operator为解剖比例及弯曲操作手臂，enclosure为有实际内部空间/观察窗/检修门的通用设备，rack为梁柱货架，agv为带防撞和导航部件的搬运车。返回createAssembly可用的部件定义；按用户尺寸与工艺调整，非厂家认证模型。不要把所有设备套用同一外壳。',Type.Object({kind:Type.Union(RECIPE_NAMES.map(k=>Type.Literal(k)))}),async(_id,args)=>textResult(JSON.stringify(industrialRecipe(args.kind)))),
    tool('check_requirements','核对明确需求','整理用户明确的数量、尺寸、配色及布局要求并用真实场景核对。quote必须逐字引用用户原文，target必须出现在用户指令中。kind=count填阿拉伯数字；kind按用户自然维度填写：length=长度、width=宽度、height=总高、depth=深度，expected填米数。长宽高默认对应X/Z/Y（几何width/depth/height）；宽深高对应X/Z/Y。不能把用户长度填成kind=width。quote尽量包含同一目标的完整尺寸描述；明确旋转或其他轴约定标为other待核对；color与other只报告待人工核对。不要把假设加入清单；新要求覆盖同目标同类型旧要求。省略items可复查已有清单；unknown不等于缺失或通过。',Type.Object({items:Type.Optional(Type.Array(Type.Object({quote:Type.String({minLength:1,maxLength:300}),target:Type.String({minLength:1,maxLength:80}),kind:Type.Union(['count','length','height','width','depth','color','other'].map(v=>Type.Literal(v))),expected:Type.String({minLength:1,maxLength:160})}),{maxItems:30}))}),async(_id,args)=>{
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
      const context=request.nodeIds?{...buildSceneContext(draft,selectionForDoc(draft),options.editScope),materials:draft.materials.map(materialContext),nodes:buildSceneContext(draft,selectionForDoc(draft),options.editScope).nodes.filter(n=>requestedIds.has(n.id))}:agentSceneContext(draft,selectionForDoc(draft),request.assemblyId,options.editScope);
      return {...textResult(JSON.stringify({...context,revision:draft.revision,scopeKey,animationWorkflow:'configure_animation→preview_animation→下一轮review_model→submit_preview。不同对象明细会同时保留；选中高亮不限制全场景编辑，历史静态-only说法已过时。'})),details:{revision:draft.revision,scopeKey,snapshot:true}};
    }),
    tool('edit_scene','修改模型草稿','对草稿应用一组建模命令，不会修改用户正式场景。每次最多40项；本次调用内可用tempId，后续调用必须用返回的真实ID。',Type.Object({summary:Type.String({minLength:1,maxLength:300}),operations:Type.Array(Type.Unknown(),{minItems:1,maxItems:40})}),async(_id,args)=>{
      let parsed:ReturnType<typeof parseModelResponse>;const hint=args.operations.some((op:any)=>op?.op==='translateAssembly')?' 整组平移请优先move_components；edit_scene准确格式为 {op:\'translateAssembly\',targetId:\'真实部件ID\',value:[dx,dy,dz]}，不是offset或position字段。':'';try{parsed=parseModelResponse(JSON.stringify(args));}catch(e){throw Error((e instanceof Error?e.message:'命令参数无效')+hint);}
      if(parsed.operations.length!==args.operations.length)throw Error('存在不支持或无效的操作，整组拒绝。请修正后重试。'+hint);
      return commitEdits({summary:args.summary,operations:parsed.operations});
    }),
    tool('inspect_scene','检查场景完整度','根据当前真实草稿返回组件空间边界并核对设计清单、配套连接间距、设备包围盒交叠、人物尺度和墙地面材质。结果是检查线索，不是工程或视觉合格证明。修改后需重新检查；可与最终截图同一轮调用。',Type.Object({}),async()=>{
      check();const report=inspectSceneQuality(draft,activity.design);if(activity.quality?.revision!==draft.revision)progress();activity.quality=report;emit(`场景检查：${report.componentCount}个组件，${report.issues.length}条待核对事项`,true);return textResult(JSON.stringify(report));
    }),
    tool('capture_multiview','获取多角度检查图','一次返回当前草稿的2–3个真实视角，适用于模型细节验收。componentId为组件/单对象ID，省略为全景；views可用perspective/front/side/back/left/top且不重复。下一轮读取图片后再audit_model_detail或review_model，不提前编造结论。',Type.Object({componentId:Type.Optional(Type.String()),views:Type.Array(Type.Union(['perspective','front','side','back','left','top'].map(x=>Type.Literal(x))),{minItems:2,maxItems:3})}),async(_id,args)=>{check();if(new Set(args.views).size!==args.views.length)throw Error('检查视角不能重复');const ids=args.componentId?draft.nodes.filter(n=>(n.assemblyId??n.id)===args.componentId).map(n=>n.id):undefined;if(ids&&!ids.length)throw Error('截图目标不存在');const content:({type:'text';text:string}|ImageContent)[]=[];let pictures:string[];if(options.capture){pictures=[];for(const view of args.views)pictures.push(await captureDraft(view,ids));}else{try{pictures=await captureSceneBatch(draft,args.views,ids,signal);}catch(e){if(signal?.aborted)throw e;visualFailure=e instanceof Error?e.message:'多角度渲染失败';throw Error(unavailableStage());}}for(const [i,view] of args.views.entries()){const picture=pictures[i];check();const key=`${draft.revision}:${view}:${args.componentId??'whole'}`;capturedViews.add(key);latestCaptureKey=key;content.push({type:'text',text:`真实检查图 revision=${draft.revision} view=${view} scope=${args.componentId??'whole'}`},asImage(picture));}capturedRevision=draft.revision;capturedTurn=calls;captureScope=args.componentId??'whole';progress();emit('多角度图片已返回，等待下一轮细节检查',true);return {content,details:{revision:draft.revision,scope:captureScope}};}),
    tool('capture_view','获取模型截图','渲染最新草稿并返回实际截图供视觉检查。必须在最后一次修改后截图。只在关键阶段或修正后截图。按edit_scene返回的review选择范围：结构/布局用scope=scene全景且不传assemblyId；单组件外观可用scope=assembly及assemblyId近景；非视觉修改无需截图。省略scope时兼容旧调用：传assemblyId为近景，否则为全场景。',Type.Object({view:Type.Union([Type.Literal('perspective'),Type.Literal('front'),Type.Literal('side'),Type.Literal('back'),Type.Literal('left'),Type.Literal('top')]),scope:Type.Optional(Type.Union([Type.Literal('scene'),Type.Literal('assembly')])),assemblyId:Type.Optional(Type.String())}),async(_id,args)=>{
      check();
      if(args.scope==='scene'&&args.assemblyId)throw new Error('全场景截图scope=scene时请省略assemblyId，不能把近景称为全景');
      if(args.scope==='assembly'&&!args.assemblyId)throw new Error('设备近景scope=assembly需要真实assemblyId');
      const targetIds=args.assemblyId?draft.nodes.filter(n=>(n.assemblyId??n.id)===args.assemblyId).map(n=>n.id):undefined;
      if(targetIds&&!targetIds.length)throw new Error('截图目标组合不存在，请读取真实assemblyId');
      const data=await captureDraft(args.view,targetIds);check();captureScope=args.assemblyId??'whole';const key=`${draft.revision}:${args.view}:${captureScope}`;latestCaptureKey=key;if(!capturedViews.has(key)){capturedViews.add(key);progress();}capturedRevision=draft.revision;capturedTurn=calls;
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
      for(const time of times){const poses=evaluate(time);if([...poses].some(([id,p])=>JSON.stringify(p)!==JSON.stringify(first.get(id))))moving=true;const picture=await captureDraft('perspective',undefined,time);check();content.push({type:'text',text:`动态样本 time=${time.toFixed(2)}s revision=${draft.revision} scope=whole；不是完整碰撞或动画验收`},asImage(picture));}
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
      const detail=refreshDetail();
      const remaining=[...new Set([...reviewIssues,...detail.issues,...args.remainingIssues,...(activity.quality?.revision===draft.revision?activity.quality.issues:[])])];
      activity.requirements=checkRequirements(draft,requirements);
      const unchecked=activity.requirements.items.filter(r=>r.status!=='pass');
      if(requirementsNeedRefresh)remaining.push('最新补充要求尚未重新整理核对');
      remaining.push(...unchecked.map(r=>`需求${r.status==='mismatch'?'不符':'待核对'}：${r.quote}；${r.actual}`));
      summary=args.summary+(remaining.length?'\n仍需改进：'+remaining.join('；'):requirement.kind==='none'?'\n已完成数据校验；本次非视觉修改无需重新截图。':'\n已完成模型自检，仍请人工核对参考图。');
      submitted=true;emit(detail.issues.length?'细节验收未完成，等待你确认保留或继续修正':'已完成本轮，等待你确认应用',true);
      return {...textResult('预览已提交，等待用户确认应用。'),terminate:true};
    }),
  ];
  const model:Model<'openai-completions'>={id:cfg.model,name:cfg.model,api:'openai-completions',provider:'chat3d-gateway',baseUrl:cfg.baseURL.trim().replace(/\/+$/,''),reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:AGENT_LIMITS.outputPerTurn,compat:{supportsDeveloperRole:false,supportsReasoningEffort:false,supportsStore:false,supportsUsageInStreaming:true,maxTokensField:'max_tokens'}};
  let geometryGuide=buildSystemPrompt(agentSceneContext(draft,selectionForDoc(draft),undefined,options.editScope)).replace(/# 参考范例[\s\S]*?# 图片/, '# 图片').replace(/# 输出格式[\s\S]*?(?=\n# |$)/, '');
  if(!wantsAnimation)geometryGuide=geometryGuide.replace(/# 对话生成动态[\s\S]*?# 建模优先级/,'# 建模优先级');
  const prompt=`当前三维渲染${visualAvailable()?'可用，保留所需视觉复核。':'不可用：继续完成全部可行的数据编辑与数量/尺寸核对，包括所有要求的对象；完成后调用submit_data_preview。不要请求截图或声称视觉通过。不能只完成第一个组件就结束。'}\n你是 chat3d 的分步建模 agent。每个主要阶段开始前，可用一两句面向用户的简短说明表达目标、约束和接下来要完成的结果；这些是公开工作摘要，不输出内部思维链、原始推理草稿或详细工具参数。不要逐轮重复状态或用轮次代替说明。用户最新明确需求优先于默认展示设置、旧方案和模型假设；本次编辑约束已按当前指令计算，不要凭历史高亮或旧助手说法制造限制。单次工具的容量限制应通过分批操作满足完整需求，不得据此擅自缩水任务。真实安全边界、数据合法性和不支持的能力必须如实说明，不能伪造完成。用工具操作草稿，用户确认前禁止修改正式场景。\n用户要求动态时优先调用原生configure_animation工具生成可播放配置（也兼容edit_scene中的setAnimation），不能用文字建议代替实现，也不要求用户先建动作库。支持通用关键帧与受限数学表达式、绑定及时间编排；不支持任意JavaScript/物理仿真。修改动画后preview_animation→下一轮review_model→submit_preview。\n复杂新场景先plan_model；已有场景的明确小改动可直接edit_scene。按工具返回review决定是否及如何截图，收到图片后下一轮review_model，达到要求后submit_preview。纯名称/分类修改无需截图；单组件外观可近景，不必全景；结构/布局用全景；动画用动态样本。\n每轮可调用多个工具，顺序执行。没有固定总轮数；有有效进展就继续。连续4轮没有新的目标明细、实际场景变化或视觉检查进展，或连续3轮工具调用失败且没有有效进展时会暂停并保留草稿。
完整车间/产线/仓库必须先用plan_model.design明确工艺顺序、布局、设备清单及数量/识别特征、验收项，并填写composition：zones分区用途、connections设备之间经何种配套连接（from/to/via用清单名称）、support配套名称/角色/数量/目的、palette统一配色、presentation镜头与材质层次。没有关系的场景connections可空，用户不需要的机器人/人员等不要强加。
通用细节验收：所有领域的独立模型和场景都必须执行同一标准，不限机加样例或目录资产。创建或修改结构前调用detail_quality_standard理解外形比例、功能结构、连接接触、材质表面、用途相关细节和完整性/环境关系六项。按对象本身的用途具体化：例如植物检查叶片/枝干生长关系，家具检查构造/支撑/接合，人物检查解剖/服装/姿态，不给任何对象强加工业零件。简单实体也应有正确边缘、比例和表面，不用无用装饰刷细节。全部结构完成后逐个目标用capture_multiview获取至少两个不同视角的近景（例如正面+背面，必要时加侧面），下一轮audit_model_detail为六项记录真实部件与画面依据，再全景检查。数据检查、网格资产、多边形数和零件数都不能直接判定细节合格。失败先修正并按最新版本重新检查，无法达到或截图不可用时保留未完成草稿，明确缺项，不说达到质量标准。只有小范围改色/改名等未改结构的任务无需重复六项验收。\n表面细节：多个部件优先set_surfaces_batch一次处理，缺UV时明确uvIfMissing，仅为必要部件投影，不覆盖已有UV；失败时原子回滚。set_surface_detail可添加真实的法线/粗糙度纹理；原始复杂网格若没有UV，应先prepare_surface_uv或由建模端展开，不能凭颜色假装贴图。基础投影不等于专业展开，须检查接缝、侧面和背面拉伸。\n对象关系：用connect_scene_parts登记手-工具、工具-操作面、进出料口等真实接触关系；先用find_scene_parts定位真实节点与变换，局部点来自实际几何，不以包围盒中心冒充表面。align只平移来源整体，姿态和朝向需另行调整。inspect_connections测量两点距离，inspect_contact_surfaces核对登记点贴近真实表面，两者都不能代替全模型碰撞和工艺验收。\n效率与局部信息：批量组件平移用move_components，delta为位移增量，减少自由JSON参数错误；彼此独立的多个精细组件用add_mesh_components一次批量创建；已有相同组件优先duplicateAssembly。定位手、控制台、接口和结构零件优先find_scene_parts按关键词只取必要部件；仅需要完整改造组件时read_scene读取全量。不要逐个添加后反复读取全部组件。无需把所有零件、顶点或贴图送进上下文；质量检查仍照常执行。\n精细网格优先：当前提供list_mesh_components和add_mesh_component。用户请求机加工设备或生产/质检/仓管/打包人员时，先查看目录，匹配项优先用精细网格；不要退回基本立方体堆叠。目录不是完整车间模板，每个对象须按需求独立选型、布置、调整；已有模型不可因新增库而擅自替换。人物按角色选工具和服装，按照目录朝向面向实际工作面；先确认控制台/工具位置与手部接近，再整机布置。没有匹配资产的设备应逐结构定制，不冒充目录模型或虚构厂家精度。网格不支持直接重写拓扑，但分部件变换/材质/删除与附加几何均可。完成后按真实截图检查近景和全景；截图不可用就明确未视觉验收。\n外形验收优先：同类设备要按工艺有可识别轮廓；不得用一个实心箱体加薄片作为最终设备。需要容纳机构的壳体应由独立面板/机架组成真实内部空间。使用profile凸轮廓挤出和lathe旋转剖面表达斜切、收腰、渐变轮廓；frame/tube表达真实空洞。操作人员按头、颈、肩胸、骨盆、上下肢分段，肩肘腕必须连接，手到实际作业高度；不要把矩形躯干和彼此悬空的圆柱当成完成的人物。金属、喷漆、橡胶、玻璃分材质，不能依靠高光掩盖形体。可先读取read_component_recipe作为可编辑结构参考，再按任务调整。\n完整度标准：每个生产单元根据其工艺需要安排操作面、进出料位置、线边物料、人员动作；输送与人工工位应实际接近而非分散摆放。人员面向实际操作区域，手部与工作高度相称。生产/暂存/物流分区有连续通路；紧凑作业区与留白通道协调，避免任意放大空地。
细节标准：同类设备的门窗、HMI、把手/通风/灯等按实际功能保持相近完成度；货架配合实际物料容器，台面配合工件，安全设施按需要设置。不要堆装饰零件刷数量。灰蓝低饱和主体、有限的安全/状态强调色可作为无指定风格时的默认假设；用户指定色优先。墙地面、设备喷漆、金属、玻璃和服装区别处理，主要设备避免全黑或全白一块。
建模时每个逻辑实体一个createAssembly，填写planKey（对应equipment或support的name）、sceneRole、zone。旧场景可setAssemblyMetadata补分类；分类本身不是完成建模。最终组合调用inspect_scene与capture_view，再针对清单缺口、包围盒候选穿插和近远景问题修正。检查工具不能判断工艺正确性、管线是否真正接通，必须看图核对。没有明确尺寸则在假设中标明，禁止改成其他工艺预设。优先完成各类代表设备的结构，必要时近景检查，再duplicateAssembly布置同类设备；允许批量完成后统一检查，避免重复输出同样部件或机械地逐台检查。
复杂任务按用户实际范围完成布局、设备与所需配套；用户未要求的人员、环境、动画等不强制补齐。布局占位仅为中间步骤，必须继续细化；不能把占位箱体作为完整车间交付，也不能仅因轮数增加要求用户重新发送。只有用户明确要求草图或真实能力受限时才提交未完成范围。
先按用户描述规划具体工艺和设备关系，利用自由组合、阵列和复制减少重复参数；禁止固定预设替换用户需求。设备应有可辨识的结构、开口、门板、操作部件和尺度，整体空间、连接与材质应统一。对象数量本身不是质量标准。
数量核对遇到名称歧义时：配套物料、附件与主体不是同一类实体，若工具报告名称歧义/待核对，应读取场景分类和真实结构并如实说明，不能为让统计通过而反复改名、改分类或删除实际需要的配套。unknown可以保留未完成草稿，不代表必须制造一个pass。\n明确需求核对：用户明确提出的数量、尺寸、颜色、排布等，用check_requirements逐字引用并记录；不记录模型自己的假设。尺寸填米，数量按完整组件。修改后复查，不符先局部修正；无法自动核对的如实标为待核对。此清单不是新权限限制，不应阻止用户保留阶段结果。\n视觉要求：不同设备应有不同外轮廓、门窗开口和功能机构，不要仅换盒子颜色。优先用frame形成真正的开口、trapezoid构成斜面与收分、tube表现中空结构；避免实体外壳封住加工空间。人物用胶囊四肢、椭球头部和适度收分的躯干，手部接近实际操作位置。
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
      if(!visualAvailable()){
        const unavailable=new Set(['capture_view','capture_multiview','preview_animation','review_model','audit_model_detail','submit_preview']);
        context={...context,messages:context.messages.map(message=>message.role==='system'?{...message,toolsAdded:message.toolsAdded?.filter(t=>!unavailable.has(t.name)),content:typeof message.content==='string'?message.content+'\n本次工具可用性覆盖：三维不可用，视觉工具不提供。忽略上文通用截图与逐项视觉审查步骤。系统会自动把全部细节标准标为未验收，不要调用audit_model_detail逐个填写unknown，也不要为凑验收字段反复读部件。继续完成所有数据对象与尺寸核对，再用submit_data_preview；不要在首个组件后结束。':message.content}:message)};
      }
      context={...context,messages:normalizeModelingRequestMessages(context.messages)};
      if(options.streamFn)return options.streamFn(m,context,streamOptions);
      return stream(model,context,{...streamOptions,apiKey:cfg.apiKey.trim(),fetch:f,maxTokens:AGENT_LIMITS.outputPerTurn,maxRetries:0,timeoutMs:AGENT_LIMITS.idleTimeoutMs,
        onProviderStreamEvent:()=>{firstData();emit(activity.title);},onResponse:()=>emit(`第 ${calls} 轮：服务已响应，正在接收`) });
    },
    beforeToolCall:async({toolCall})=>{check();if(stageReason)return {block:true,reason:stageReason,terminate:true};if(!visualAvailable()&&toolCall.name==='audit_model_detail')return {block:true,reason:'当前无可用画面证据，系统已自动标记细节未验收；无需逐项填写unknown。继续完成数据编辑与必要数量检查，然后submit_data_preview。'};if(!visualAvailable()&&(['capture_view','capture_multiview','preview_animation','review_model'].includes(toolCall.name)||(toolCall.name==='submit_preview'&&reviewRequirement(base,draft).kind!=='none')))return {block:true,reason:unavailableStage(),terminate:true};if(runner.hasQueuedMessages())return {block:true,reason:'用户补充了新指令，请先读取并按最新要求重新决定操作',terminate:true};if(questionOnly&&['edit_scene','configure_animation','configure_process_route','add_reference_component','add_mesh_component','add_mesh_components','connect_scene_parts','remove_connection','set_surface_detail','set_surfaces_batch','prepare_surface_uv','move_components','submit_data_preview','submit_preview'].includes(toolCall.name))return {block:true,reason:'用户当前选择只提问，请直接回答，不要修改或提交场景',terminate:true};if(seenCalls.has(toolCall.id))return {block:true,reason:'重复的工具调用ID已拒绝，避免重复修改'};seenCalls.add(toolCall.id);if(submitted)return {block:true,reason:'本轮已提交预览',terminate:true};if(pauseReason)return {block:true,reason:pauseReason,terminate:true};activity.toolCalls++;return undefined;},
    finishTurn:async({message})=>{
      if(stageReason){emit(stageReason,true);return {action:'end'};}

      if(runner.hasQueuedMessages()){submitted=false;pauseReason='';stagnantTurns=0;failedTurns=0;return {action:'continue'};}
      if(submitted)return {action:'end'};
      const answeredSteering=(respondingToSteering||questionOnly)&&message.stopReason==='stop'&&!message.content.some(c=>c.type==='toolCall');respondingToSteering=false;
      if(answeredSteering)return {action:'end'};
      if(message.stopReason==='stop'&&!message.content.some(c=>c.type==='toolCall')){emit('模型已结束文字回复，本轮不再自动续问；已有修改仅保留为待确认草稿',true);return {action:'end'};}
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
      if(e.type==='text_delta'){
        const id=`explanation-${calls}`;const entries=activity.explanations??[];const previous=entries.find(v=>v.id===id)?.text??'';
        activity.explanations=[...entries.filter(v=>v.id!==id),{id,text:(previous+e.delta).slice(0,4000)}].slice(-40);
      }
      if(e.type==='text_delta'||e.type==='toolcall_delta'){
        firstData();
        activity.characters+=e.delta.length;emit(e.type==='toolcall_delta'?'正在接收建模工具参数':'正在接收模型回复');
      }
    }
    if(event.type==='message_end' && event.message.role==='assistant'){
      const publicText=event.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
      if(publicText.trim()){const id=`explanation-${calls}`;activity.explanations=[...(activity.explanations??[]).filter(v=>v.id!==id),{id,text:publicText.slice(0,4000)}].slice(-40);}
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
    if(operations.length&&!submitted){emit('本轮结束，已保留未完成阶段草稿',true);return checkpoint(stageReason|| (pauseReason?(pauseReason+'\n原始工具错误：'+rootToolErrors.join('；')):last?.role==='assistant'&&last.stopReason==='stop'&&last.content.some(c=>c.type==='text')?last.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'本轮未完成“最新截图→复核→提交”，没有自动修改正式场景。'));}
    if(!operations.length&&stageReason)throw new Error(stageReason);
    if(!operations.length && pauseReason)throw new Error(pauseReason+'\n最近执行：'+activity.events.filter(e=>/^第\d+轮执行/.test(e)).slice(-4).join('；')+(rootToolErrors.length?'\n原始工具错误：'+rootToolErrors.join('；'):''));
    if(!operations.length){summary=last?.role==='assistant'?last.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';if(!summary.trim())throw new Error(lastToolError?'工具调用未完成：'+lastToolError:'模型未返回有效回复，请检查模型工具调用支持');
      if(summary.trim().startsWith('{') && summary.includes('\"operations\"'))throw new Error('模型输出了普通JSON而未调用建模工具。请检查网关的工具调用支持，或在模型配置切回单次生成');}
    return {batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:options.selection,editScope:options.editScope,summary,operations,...((requirementsNeedRefresh||!!activity.detailAcceptance?.issues.length||activity.requirements?.items.some(r=>r.status!=='pass'))?{incomplete:true,continuation:'继续核对并完成：'+executionTexts.join('；')}:{})},result:{doc:draft,applied,errors:[]},activity};
  } catch(error) {
    if(operations.length && !signal?.aborted){emit('任务中断，已保留阶段草稿',true);return checkpoint(error instanceof Error?error.message:'模型请求中断');}
    throw error;
  } finally {acceptingSteering=false;options.onControl?.(null);unsubscribe();signal?.removeEventListener('abort',abort);}
}
