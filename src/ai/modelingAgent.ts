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
export interface ActivityTiming { id:string; kind:'model'|'tool'; label:string; startedAt:number; firstDataAt?:number; endedAt?:number; inputTokens?:number; outputTokens?:number }
export interface DesignBrief {flow:string[];layout:string;equipment:{name:string;count:number;features:string[]}[];checks:string[];composition?:CompositionPlan}
export interface AgentActivity {
  design?:DesignBrief;
  quality?:QualityReport;
  title: string; turn: number; toolCalls: number; characters: number;
  inputTokens: number; outputTokens: number; usageReported: boolean;
  lastEventAt: number; plan: string[]; events: string[]; timings: ActivityTiming[];
}
export interface AgentResult { batch: CommandBatch; result: ExecutionResult; activity: AgentActivity }
interface AgentOptions {
  text: string; config: ModelConfig; document: SceneDocument; selection: string[];
  images?: string[]; history?: ConversationTurn[]; signal?: AbortSignal; editScope?:EditScope;
  onActivity?: (activity: AgentActivity) => void;
  onPreview?: (doc: SceneDocument) => void;
  onCheckpoint?: (result: AgentResult) => void;
  // Dependency injection for automated checks; production uses Pi's OpenAI-compatible adapter.
  streamFn?: StreamFn;
  capture?: (doc: SceneDocument, view: CaptureView, targetIds?:string[]) => Promise<string>;
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
 if(!scope?.nodeIds)return scope??{};
 const assemblies=selectedAssemblies(doc,scope.nodeIds),full=new Set(assemblies),byId=new Map(doc.nodes.map(n=>[n.id,n]));
 return {...scope,nodeIds:scope.nodeIds.filter(id=>!full.has(byId.get(id)?.assemblyId??'')),selectedAssemblies:assemblies.map(id=>({id,parts:doc.nodes.filter(n=>n.assemblyId===id).length}))};
}
function agentSceneContext(doc:SceneDocument,selection:string[],assemblyId?:string){
 const byId=new Map(doc.nodes.map(n=>[n.id,n])),selected=new Set(selection),full=new Set(selectedAssemblies(doc,selection));
 const counts=new Map<string,number>(),anchors=new Map<string,string>();for(const n of doc.nodes)if(n.assemblyId){counts.set(n.assemblyId,(counts.get(n.assemblyId)??0)+1);if(!anchors.has(n.assemblyId)||n.id===n.assemblyId)anchors.set(n.assemblyId,n.id);}
 const used=new Set(doc.nodes.map(n=>n.materialId));
 const detail={...buildSceneContext(doc,selection),materials:doc.materials.filter(m=>used.has(m.id))};
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
  let latestScene=-1, latestEdit=-1, latestInspection=-1, latestCaptureRevision='';
  for(let i=0;i<messages.length;i++) {
    const m=messages[i];
    if(m.role!=='toolResult'||m.isError)continue;
    if(m.toolName==='read_scene'||m.toolName==='edit_scene')latestScene=i;
    if(m.toolName==='edit_scene')latestEdit=i;
    if(m.toolName==='inspect_scene')latestInspection=i;
    if(m.toolName==='capture_view') {
      const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      latestCaptureRevision=/revision=(\d+)/.exec(text)?.[1]??'';
    }
  }
  // Remove old successful edit call/result PAIRS, preserving the newest edit, errors,
  // user instructions and IDs supplied by current scene reads. Never mutate stored transcript.
  const historical=new Map<string,string>();
  for(let i=0;i<latestEdit;i++){
    const m=messages[i];if(m.role==='toolResult'&&m.toolName==='edit_scene'&&!m.isError&&i!==latestScene&&i!==latestEdit)historical.set(m.toolCallId,'');
  }
  const paired=new Set<string>();
  for(const m of messages)if(m.role==='assistant')for(const c of m.content)if(c.type==='toolCall'&&historical.has(c.id))paired.add(c.id);
  return messages.map((m,i)=>{
    if(m.role==='assistant')return {...m,content:m.content.map(c=>c.type==='toolCall'&&paired.has(c.id)?{type:'text' as const,text:`[历史edit_scene已成功：${String(c.arguments.summary??'场景修改').slice(0,180)}。参数已省略，以最新场景与read_scene为准。]`}:c)};
    if(m.role!=='toolResult'||m.isError)return m;
    if(m.toolName==='inspect_scene'&&i!==latestInspection)return {...m,content:[{type:'text' as const,text:'历史场景检查已省略，请以最新检查和当前几何为准。'}]};
    if((m.toolName==='read_scene'||m.toolName==='edit_scene')&&i!==latestScene&&i!==latestEdit)
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
  const needsDesign=base.nodes.length===0&&/车间|产线|仓库|工厂|workshop|factory|warehouse|production line/i.test(options.text);
  const reviewedPrototypes=new Map<string,string>();
  const assemblyFingerprint=(id:string)=>JSON.stringify(draft.nodes.filter(n=>n.assemblyId===id));
  const operations: Command[]=[];
  const applied: ExecutionResult['applied']=[];
  let capturedRevision=-1, capturedTurn=-1, reviewedRevision=-1, reviewedWholeRevision=-1, captureScope='whole', submitted=false, summary='';
  let progressVersion=0, observedProgress=0, stagnantTurns=0, consecutiveErrors=0, pauseReason='';
  const capturedViews=new Set<string>();
  const progress=()=>{progressVersion++;consecutiveErrors=0;};
  let reviewIssues:string[]=[];
  let activity: AgentActivity={title:'准备 Pi 建模任务',turn:0,toolCalls:0,characters:0,inputTokens:0,outputTokens:0,usageReported:false,lastEventAt:Date.now(),plan:[],events:[],timings:[]};
  const emit=(title:string,record=false) => {
    activity={...activity,title,lastEventAt:Date.now(),events:record?[...activity.events,title].slice(-30):activity.events};
    options.onActivity?.({...activity,plan:[...activity.plan],events:[...activity.events],timings:activity.timings.map(t=>({...t}))});
  };
  const checkpoint=(reason='任务尚未完成') : AgentResult => ({
    batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:[...options.selection],editScope:options.editScope,
      incomplete:true,continuation:`继续完成原任务：${options.text || '根据参考图建模'}。当前场景是已保留的阶段成果，先检查现有对象，保留有效部分，不要重复创建；优先完成下一阶段并截图复核。`,
      summary:`阶段草稿已保留（未完成最终复核）\n${reason}\n已执行 ${operations.length} 项操作，当前 ${draft.nodes.length} 个对象。请人工检查后保留此阶段，或放弃。`+(reviewIssues.length?'\n已知问题：'+reviewIssues.join('；'):''),operations:structuredClone(operations)},
    result:{doc:structuredClone(draft),applied:structuredClone(applied),errors:[]},activity:structuredClone(activity)
  });
  const stamp=(id:string,patch:Partial<ActivityTiming>)=>{activity.timings=activity.timings.map(t=>t.id===id?{...t,...patch}:t);};
  const firstData=()=>{const t=activity.timings.find(t=>t.id===`model-${calls}`);if(t && t.firstDataAt===undefined)stamp(t.id,{firstDataAt:Date.now()});};
  const check=() => {if(signal?.aborted)throw new DOMException('已停止','AbortError');};
  const tool=<T extends TSchema>(name:string,label:string,description:string,parameters:T,execute:AgentTool<T>['execute']):AgentTool<any>=>({name,label,description,parameters,executionMode:'sequential',execute:execute as AgentTool['execute']});
  const tools: AgentTool<any>[]=[
    tool('plan_model','规划建模步骤','修改前记录操作计划与尺寸假设。完整车间/产线/仓库需提供design和composition：工艺顺序、布局、设备特征、分区、连接、配套、配色取景与验收检查。只记录交付设计，不输出内部推理。',Type.Object({steps:Type.Array(Type.String({maxLength:120}),{minItems:1,maxItems:6}),assumptions:Type.String({maxLength:600}),design:Type.Optional(Type.Object({flow:Type.Array(Type.String({maxLength:100}),{minItems:1,maxItems:12}),layout:Type.String({minLength:5,maxLength:600}),equipment:Type.Array(Type.Object({name:Type.String({minLength:1,maxLength:80}),count:Type.Integer({minimum:1,maximum:100}),features:Type.Array(Type.String({maxLength:100}),{minItems:1,maxItems:6})}),{minItems:1,maxItems:16}),checks:Type.Array(Type.String({maxLength:120}),{minItems:1,maxItems:8}),composition:Type.Optional(compositionSchema)}))}),async(_id,args)=>{
      check();if(needsDesign&&(!args.design||!args.design.composition))throw new Error('完整场景请先补全design：flow、layout、equipment（名称/数量/特征）、checks，以及composition（分区、连接、配套、配色与取景），不能直接堆占位模型');
      activity.plan=args.steps;activity.design=args.design;emit(`计划：${args.steps.join(' → ')}；${args.assumptions}`,true);return textResult('设计已记录。按设备→输送/转运→工位→物料→人员动作建立关系；先完成各类代表设备近景，再布置同类设备与配套。createAssembly的planKey对应设计清单名称，sceneRole标明类别；不适用的配套不添加。局部编辑严格遵守本次作用范围。');
    }),
    tool('read_scene','读取当前场景','读取草稿真实对象。默认设备按组件摘要返回；需要修改设备零件时传 assemblyId 读取该设备全部零件的真实 ID 和几何。',Type.Object({assemblyId:Type.Optional(Type.String())}),async(_id,args)=>{
      check();if(args.assemblyId&&!draft.nodes.some(n=>n.assemblyId===args.assemblyId))throw new Error('设备组件不存在');return textResult(JSON.stringify(agentSceneContext(draft,selectionForDoc(draft),args.assemblyId)));
    }),
    tool('edit_scene','修改模型草稿','对草稿应用一组建模命令，不会修改用户正式场景。每次最多40项；本次调用内可用tempId，后续调用必须用返回的真实ID。',Type.Object({summary:Type.String({minLength:1,maxLength:300}),operations:Type.Array(Type.Unknown(),{minItems:1,maxItems:40})}),async(_id,args)=>{
      check();if(!activity.plan.length)throw new Error('请先调用 plan_model 说明建模步骤');
      if(submitted)throw new Error('已提交预览，本轮不能继续修改');
      const parsed=parseModelResponse(JSON.stringify(args));
      if(parsed.operations.length!==args.operations.length) throw new Error('存在不支持或无效的操作，整组拒绝。请修正后重试');
      if(needsDesign)for(const op of parsed.operations)if(op.op==='duplicateAssembly'){
        const root=draft.nodes.find(n=>n.id===op.targetId),id=root?.assemblyId;
        if(!id||reviewedPrototypes.get(id)!==assemblyFingerprint(id))throw new Error('复制前必须对代表设备调用capture_view({assemblyId})并在下一轮review_model确认无未解决问题；修改后需重新复核');
      }
      const result=applyBatch(draft,{operations:parsed.operations});
      if(result.errors.length)throw new Error(result.errors.map(e=>e.message).join('；'));
      const scopeErrors=checkEditScope(base,result.doc,options.editScope);if(scopeErrors.length)throw new Error(scopeErrors.join('；'));
      const errors=validateDocument(result.doc);if(errors.length)throw new Error(errors.map(e=>e.message).join('；'));
      check();
      const changed=JSON.stringify(draft.nodes)!==JSON.stringify(result.doc.nodes)||JSON.stringify(draft.materials)!==JSON.stringify(result.doc.materials);
      if(!changed)throw new Error('本次操作未改变场景，请执行计划中的有效修改或复核提交');
      progress();
      draft=result.doc;applied.push(...result.applied);operations.push(...parsed.operations);
      reviewedRevision=-1;options.onCheckpoint?.(checkpoint());options.onPreview?.(draft);emit(`草稿已更新：${args.summary}（共 ${draft.nodes.length} 个对象）`,true);
      return textResult(JSON.stringify({revision:draft.revision,scene:agentSceneContext(draft,selectionForDoc(draft)),next:'继续完成计划中的结构、细节与环境；关键阶段或最终修改后用 capture_view 检查，下一轮复核。不要在占位阶段提前提交成品。'}));
    }),
    tool('inspect_scene','检查场景完整度','根据当前真实草稿返回组件空间边界并核对设计清单、配套连接间距、设备包围盒交叠、人物尺度和墙地面材质。结果是检查线索，不是工程或视觉合格证明。修改后需重新检查；可与最终截图同一轮调用。',Type.Object({}),async()=>{
      check();const report=inspectSceneQuality(draft,activity.design);if(activity.quality?.revision!==draft.revision)progress();activity.quality=report;emit(`场景检查：${report.componentCount}个组件，${report.issues.length}条待核对事项`,true);return textResult(JSON.stringify(report));
    }),
    tool('capture_view','获取模型截图','渲染最新草稿并返回实际截图供视觉检查。必须在最后一次修改后截图。只在关键阶段或修正后截图。传assemblyId可聚焦设备细节，省略则拍全场景；提交前必须完成最终全景复核。',Type.Object({view:Type.Union([Type.Literal('perspective'),Type.Literal('front'),Type.Literal('side'),Type.Literal('top')]),assemblyId:Type.Optional(Type.String())}),async(_id,args)=>{
      check();
      const targetIds=args.assemblyId?draft.nodes.filter(n=>n.assemblyId===args.assemblyId).map(n=>n.id):undefined;
      if(targetIds&&!targetIds.length)throw new Error('截图目标组合不存在，请读取真实assemblyId');
      const data=await (options.capture??captureScene)(draft,args.view,targetIds);check();captureScope=args.assemblyId??'whole';const key=`${draft.revision}:${args.view}:${captureScope}`;if(!capturedViews.has(key)){capturedViews.add(key);progress();}capturedRevision=draft.revision;capturedTurn=calls;
      emit(`已获取 ${args.view} 视角截图，等待模型复核`,true);
      return {content:[{type:'text' as const,text:`这是草稿 revision=${draft.revision} scope=${captureScope} 的真实渲染截图。对照用户参考图检查。`},asImage(data)],details:{revision:draft.revision,view:args.view}};
    }),
    tool('review_model','记录视觉检查','看过最新截图后记录外轮廓、比例、悬空/穿插、颜色和参考图差异。存在差距必须如实记录。',Type.Object({observations:Type.String({minLength:5,maxLength:1200}),issues:Type.Array(Type.String({maxLength:200}),{maxItems:8})}),async(_id,args)=>{
      check();if(calls<=capturedTurn)throw new Error('截图刚刚返回，请在下一轮读取图片后再调用 review_model，不能提前编造视觉检查');
      if(capturedRevision!==draft.revision)throw new Error('请先获取当前版本截图，再做视觉检查');
      if(reviewedRevision!==draft.revision)progress();
      if(captureScope!=='whole'&&!args.issues.length)reviewedPrototypes.set(captureScope,assemblyFingerprint(captureScope));
      reviewedRevision=draft.revision;if(captureScope==='whole')reviewedWholeRevision=draft.revision;reviewIssues=[...args.issues];
      emit(`视觉检查：${args.observations}${args.issues.length?'；待改进：'+args.issues.join('；'):''}`,true);
      return textResult(args.issues.length ? '差异已记录。预算足够时修改后重新截图检查；无法解决的差异需在 submit_preview 明确列出。' : '已记录模型自检，不代表人工验收通过。可提交预览。');
    }),
    tool('submit_preview','提交待确认预览','结束本轮，把草稿交给用户确认，不能直接写入正式场景。必须先完成最新截图复核。',Type.Object({summary:Type.String({minLength:1,maxLength:1200}),remainingIssues:Type.Array(Type.String({maxLength:200}),{maxItems:8})}),async(_id,args)=>{
      check();if(needsDesign&&activity.quality?.revision!==draft.revision)throw new Error('完整场景提交前请调用inspect_scene检查最新草稿的配套、连接与尺度');if(!operations.length)throw new Error('未修改场景，无需提交；直接回答用户即可');
      if(reviewedRevision!==draft.revision||reviewedWholeRevision!==draft.revision)throw new Error('必须先对最后一次修改获取全场景截图并调用 review_model');
      const remaining=[...new Set([...reviewIssues,...args.remainingIssues,...(activity.quality?.revision===draft.revision?activity.quality.issues:[])])];
      summary=args.summary+(remaining.length?'\n仍需改进：'+remaining.join('；'):'\n已完成模型自检，仍请人工核对参考图。');
      submitted=true;emit('已完成本轮，等待你确认应用',true);
      return {...textResult('预览已提交，等待用户确认应用。'),terminate:true};
    }),
  ];
  const model:Model<'openai-completions'>={id:cfg.model,name:cfg.model,api:'openai-completions',provider:'chat3d-gateway',baseUrl:cfg.baseURL.trim().replace(/\/+$/,''),reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:AGENT_LIMITS.outputPerTurn,compat:{supportsDeveloperRole:false,supportsReasoningEffort:false,supportsStore:false,supportsUsageInStreaming:true,maxTokensField:'max_tokens'}};
  const geometryGuide=buildSystemPrompt(agentSceneContext(draft,selectionForDoc(draft))).replace(/# 参考范例[\s\S]*?# 图片/, '# 图片').replace(/# 输出格式[\s\S]*?(?=\n# |$)/, '');
  const prompt=`你是 chat3d 的分步建模 agent。用工具操作草稿，用户确认前禁止修改正式场景。\n建模顺序：plan_model → read_scene/edit_scene → capture_view → review_model → 必要时局部修正并再次截图 → submit_preview。\n每轮可调用多个工具，顺序执行。没有固定总轮数；有有效进展就继续。连续4轮没有实际场景变化或新的视觉检查进展，或连续3次工具失败时会暂停并保留草稿。
完整车间/产线/仓库必须先用plan_model.design明确工艺顺序、布局、设备清单及数量/识别特征、验收项，并填写composition：zones分区用途、connections设备之间经何种配套连接（from/to/via用清单名称）、support配套名称/角色/数量/目的、palette统一配色、presentation镜头与材质层次。没有关系的场景connections可空，用户不需要的机器人/人员等不要强加。
完整度标准：每个生产单元根据其工艺需要安排操作面、进出料位置、线边物料、人员动作；输送与人工工位应实际接近而非分散摆放。人员面向实际操作区域，手部与工作高度相称。生产/暂存/物流分区有连续通路；紧凑作业区与留白通道协调，避免任意放大空地。
细节标准：同类设备的门窗、HMI、把手/通风/灯等按实际功能保持相近完成度；货架配合实际物料容器，台面配合工件，安全设施按需要设置。不要堆装饰零件刷数量。灰蓝低饱和主体、有限的安全/状态强调色可作为无指定风格时的默认假设；用户指定色优先。墙地面、设备喷漆、金属、玻璃和服装区别处理，主要设备避免全黑或全白一块。
建模时每个逻辑实体一个createAssembly，填写planKey（对应equipment或support的name）、sceneRole、zone。旧场景可setAssemblyMetadata补分类；分类本身不是完成建模。最终组合调用inspect_scene与capture_view，再针对清单缺口、包围盒候选穿插和近远景问题修正。检查工具不能判断工艺正确性、管线是否真正接通，必须看图核对。没有明确尺寸则在假设中标明，禁止改成其他工艺预设。先完成各类代表设备的结构与近景复核，复核后再duplicateAssembly布置同类设备，避免重复输出同样部件或复制未经检查的占位模型。
复杂任务在同一次任务内依次完成布局、各类设备结构与细节、人员及输送连接、车间环境、材质与取景复核。布局占位仅为中间步骤，必须继续细化；不能把占位箱体作为完整车间交付，也不能仅因轮数增加要求用户重新发送。只有用户明确要求草图或真实能力受限时才提交未完成范围。
先按用户描述规划具体工艺和设备关系，利用自由组合、阵列和复制减少重复参数；禁止固定预设替换用户需求。设备应有可辨识的结构、开口、门板、操作部件和尺度，整体空间、连接与材质应统一。对象数量本身不是质量标准。
视觉要求：不同设备应有不同外轮廓、门窗开口和功能机构，不要仅换盒子颜色。优先用frame形成真正的开口、trapezoid构成斜面与收分、tube表现中空结构；避免实体外壳封住加工空间。人物用胶囊四肢、椭球头部和适度收分的躯干，手部接近实际操作位置。
空间要求：按用户工艺组织设备顺序和朝向，保留人员操作面与连续通道，补齐必要的线边物料、转运和安全分区；无依据的设施不要凭空堆砌。前景、中景、背景有主次，设备与地面、墙面材质分离。
质量复核：先用capture_view({view:'perspective',assemblyId:'真实组合ID'})检查代表设备的开口、部件贴合、材质和人物尺度；修正后再拍全景检查疏密、连接和统一观感。不能只凭远景小图宣布细节合格。截图中的框选线或界面不属于模型细节。
每次 edit_scene 控制在40项以内，较大的场景分批构建并连续推进。出现错误先根据具体错误修正；不要重复相同失败调用。完成结构和细节后截图，视觉问题可修复时继续编辑、截图、复核，再提交。
效率规则：空场景创建时，尽量在同一响应依次调用 plan_model、edit_scene；复杂场景按计划分批编辑后再 capture_view；工具仍按顺序执行。拿到截图后，在下一响应调用 review_model；达到用户要求后再 submit_preview。只在需要真实ID或额外信息时调用 read_scene，edit_scene 已返回最新完整场景，不要重复读取。必须依赖工具结果的操作放在下一轮，不能猜测ID。
创建时省略默认字段：parentId 默认 null、单位 scale 默认[1,1,1]、rotationQuaternion 默认[0,0,0,1]；只给非默认位置或朝向。参数使用紧凑JSON，避免在工具调用前复述长篇说明。
可用现有工具修正的穿插、悬空与明显比例错误，应集中一次修正再截图；不支持的复杂曲面和标识如实列出，不要反复尝试无效方法。
capture_view 和 review_model 必须分在不同模型轮次，先收到图片才允许描述检查结果。\n如果只是询问、闲聊或缺少关键需求，直接中文回答或澄清，不要强行建模。\n不能把“生成成功”写成“精确还原”。模型自检不是客观质量评分。先外形比例、再部件关系、后细节，不要用配色掩盖结构错误。只看参考图确定可见部分，未见部分标为假设。\n工具命令参数参考如下；其中“一次输出最终JSON”的旧规则只适用于 edit_scene 的参数，当前必须使用原生工具调用，不能把工具调用写成普通JSON文本。\n${geometryGuide}\n本次编辑约束：${JSON.stringify(scopeContext(base,options.editScope))}。有nodeIds或selectedAssemblies时只可修改所列节点或所列完整组件；仅allowAssemblyAdditions=true且完整组件都被选中时，允许向该组件追加/替换部件。禁止新建其他组件或修改未选中对象；lockPlacement为true时保留所有已有对象的位置与朝向。范围不够就说明需要用户调整，不能自行扩大。\n最近对话（只供意图理解，场景以工具返回为准）：\n${(options.history??[]).slice(-8).map(m=>m.role+': '+m.text.slice(0,1000)).join('\n')}`;
  const f=options.streamFn?undefined:await getFetch();
  let calls=0;
  const seenCalls=new Set<string>();
  const runner=new Agent({
    initialState:{model,systemPrompt:prompt,tools,thinkingLevel:'off'},toolExecution:'sequential',
    transformContext:async messages=>compactAgentContext(messages),
    streamFn:async(m,context,streamOptions)=>{
      check();if(submitted)throw new Error('本轮已完成');
      if(pauseReason)throw new Error(pauseReason);
      if(JSON.stringify(context).length>2*1024*1024)throw new Error('本轮上下文超过2MB上限，请减少参考图或拆分场景');
      calls++;activity.turn=calls;activity.timings=[...activity.timings,{id:`model-${calls}`,kind:'model',label:`模型第 ${calls} 轮`,startedAt:Date.now()}];emit(`第 ${calls} 轮：等待模型决定下一步`);
      const budgetNote=`\n当前第${calls}轮，连续${stagnantTurns}轮没有有效进展。继续完成计划与细节，不因轮数增加提前收尾。当前输入${activity.inputTokens}、输出${activity.outputTokens} Token；避免无效重复。`;
      context={...context,messages:context.messages.map((message,index)=>index===0 && message.role==='system'?{...message,content:typeof message.content==='string'?message.content+budgetNote:[...message.content,{type:'text' as const,text:budgetNote}]}:message)};
      if(options.streamFn)return options.streamFn(m,context,streamOptions);
      return stream(model,context,{...streamOptions,apiKey:cfg.apiKey.trim(),fetch:f,maxTokens:AGENT_LIMITS.outputPerTurn,maxRetries:0,timeoutMs:AGENT_LIMITS.idleTimeoutMs,
        onProviderStreamEvent:()=>{firstData();emit(activity.title);},onResponse:()=>emit(`第 ${calls} 轮：服务已响应，正在接收`) });
    },
    beforeToolCall:async({toolCall})=>{check();if(seenCalls.has(toolCall.id))return {block:true,reason:'重复的工具调用ID已拒绝，避免重复修改'};seenCalls.add(toolCall.id);if(submitted)return {block:true,reason:'本轮已提交预览',terminate:true};if(pauseReason)return {block:true,reason:pauseReason,terminate:true};activity.toolCalls++;return undefined;},
    finishTurn:async()=>{
      if(submitted)return {action:'end'};
      stagnantTurns=progressVersion===observedProgress?stagnantTurns+1:0;observedProgress=progressVersion;
      if(stagnantTurns>=AGENT_LIMITS.noProgressTurns)pauseReason='连续4轮没有有效建模或复核进展，已暂停以避免空转';
      if(pauseReason){emit(pauseReason,true);return {action:'end'};}
      return operations.length?{action:'continue'}:undefined;
    },
  });
  const abort=()=>runner.abort();signal?.addEventListener('abort',abort,{once:true});
  const unsubscribe=runner.subscribe(event=>{
    if(signal?.aborted)return;
    if(event.type==='tool_execution_start'){const label=tools.find(t=>t.name===event.toolName)?.label??event.toolName;activity.timings=[...activity.timings,{id:event.toolCallId,kind:'tool',label,startedAt:Date.now()}];emit(`正在${label}`);}
    if(event.type==='tool_execution_end'){stamp(event.toolCallId,{endedAt:Date.now()});emit(activity.title);}
    if(event.type==='tool_execution_end'){
      if(event.isError){
        consecutiveErrors++;
        const result=event.result as {content?:{type:string;text?:string}[]};
        const detail=(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join(' ').slice(0,500);
        emit(`工具失败：${event.toolName}${detail?'：'+detail:''}`,true);
        if(consecutiveErrors>=AGENT_LIMITS.consecutiveErrors)pauseReason='连续3次工具失败，已暂停；请查看执行记录，成功草稿已保留';
      }else consecutiveErrors=0;
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
    await runner.prompt(options.text||'请根据参考图建模',(options.images??[]).map(asImage));check();
    const last=[...runner.state.messages].reverse().find(m=>m.role==='assistant');
    if(last?.role==='assistant' && (last.stopReason==='error'||last.stopReason==='aborted'))throw new Error(last.errorMessage||'模型服务未完成请求，请检查工具调用兼容性');
    if(operations.length&&!submitted){emit('本轮结束，已保留未完成阶段草稿',true);return checkpoint(pauseReason||'本轮未完成“最新截图→复核→提交”，没有自动修改正式场景。');}
    if(!operations.length && pauseReason)throw new Error(pauseReason);
    if(!operations.length){summary=last?.role==='assistant'?last.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';if(!summary.trim())throw new Error('模型未返回有效回复，请检查模型工具调用支持');
      if(summary.trim().startsWith('{') && summary.includes('\"operations\"'))throw new Error('模型输出了普通JSON而未调用建模工具。请检查网关的工具调用支持，或在模型配置切回单次生成');}
    return {batch:{requestId:makeId(),projectId:base.projectId,baseRevision:base.revision,selectedIds:options.selection,editScope:options.editScope,summary,operations},result:{doc:draft,applied,errors:[]},activity};
  } catch(error) {
    if(operations.length && !signal?.aborted){emit('任务中断，已保留阶段草稿',true);return checkpoint(error instanceof Error?error.message:'模型请求中断');}
    throw error;
  } finally {unsubscribe();signal?.removeEventListener('abort',abort);}
}
