import {Button,TextArea} from '@radix-ui/themes';
import {isSoftwareCaptureAvailable} from '../scene/softwareCapture';
import {isServerCaptureAvailable} from '../scene/serverCapture';
import {evaluateDetailAcceptance} from '../domain/detailAcceptance';
import {SiteAccessRecovery} from './SiteAccessRecovery';
import {ConversationRun} from './ConversationRun';
import {MessageText} from './MessageText';
import {continueDraft,type DraftBaseline} from '../domain/draftContinuation';
import {userEditScope} from '../domain/conversationScope';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSceneContext, generateBatch } from '../ai/provider';
import { GenerationProgress } from '../ai/stream';
import type { AgentActivity, AgentResult, AgentControl } from '../ai/modelingAgent';
import { AGENT_LIMITS } from '../ai/agentPolicy';
import { applyBatch, CommandBatch, ExecutionResult } from '../domain/commands';
import {checkEditScope,sceneChanges,type EditScope} from '../domain/editScope';
import { makeId } from '../util/ids';
import { useEditorStore } from '../store';

const MAX_IMAGES = 4;
export const REQUEST_TIMEOUT_MS = 180_000;
async function compressImage(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法处理图片（浏览器不支持 canvas）');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function ChatPanel({onConfigure,onAssets}:{executionDetails?:boolean;onConfigure?:()=>void;onAssets?:()=>void}={}) {
  const { messages, aiStatus, aiError, pendingBatch, pendingResult, aiConfig, selection, doc } = useEditorStore();
  const store = useEditorStore.getState;
  const input=useEditorStore(s=>s.composerText);
  const setInput=(text:string)=>store().setComposerText(text);
  const attachments=useEditorStore(s=>s.composerImages);
  const setAttachments=(value:string[]|((previous:string[])=>string[]))=>store().setComposerImages(typeof value==='function'?value(store().composerImages):value);
  const [lockPlacement,setLockPlacement]=useState(false);
  const [scopeMode,setScopeMode]=useState<'scene'|'selection'>('scene');
  useEffect(()=>{setScopeMode('scene');setLockPlacement(false);},[doc.projectId]);
  const [compareBefore,setCompareBefore]=useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [agentActivity, setAgentActivity] = useState<AgentActivity | null>(()=>store().lastRun);
  const controlRef=useRef<AgentControl|null>(null);
  const [canSteer,setCanSteer]=useState(false);
  const markSteering=(id:string,status:'queued'|'received'|'interrupted')=>useEditorStore.setState(state=>({messages:state.messages.map(m=>m.id===id?{...m,steering:{runId:runMessageId.current??'',status}}:m)}));
  const clearControl=()=>{controlRef.current=null;setCanSteer(false);useEditorStore.setState(state=>({messages:state.messages.map(m=>m.steering?.runId===runMessageId.current&&m.steering.status==='queued'?{...m,steering:{...m.steering,status:'interrupted' as const}}:m)}));};
  const runMessageId=useRef<string|null>(null);
  const parentDraft=useRef<DraftBaseline|null>(null);
  const finishRun=(status:'preview'|'completed'|'failed'|'stopped')=>{if(runMessageId.current)store().updateMessageRun(runMessageId.current,{status,endedAt:Date.now(),activity:store().lastRun??undefined});};
  const [runPi, setRunPi] = useState(false);
  const [, setProgress] = useState<GenerationProgress | null>(null);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [lastRequest, setLastRequest] = useState<{text: string; images: string[]} | null>(null);
  const [reuseReference, setReuseReference] = useState(true);
  const [imageView, setImageView] = useState<string | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const composingRef = useRef(false);
  const runRef = useRef(0);
  const checkpointRef = useRef<AgentResult | null>(null);
  const runningRef = useRef(false);
  const imageBusyRef = useRef(false);
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = ['capturing','context','generating','validating','applying'].includes(aiStatus);
  const viewportStatus=useEditorStore(s=>s.viewportStatus);
  const previewing = aiStatus === 'previewing';
  const changes=useMemo(()=>previewing&&pendingResult?sceneChanges(doc,pendingResult.doc):[],[previewing,doc,pendingResult]);
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false; runRef.current++; runningRef.current = false;
      abortRef.current?.abort(); if(timeoutRef.current) clearTimeout(timeoutRef.current);
      if (['capturing','context','generating','validating'].includes(store().aiStatus)) { store().setAiStatus('cancelled'); store().setPreviewDoc(null); }
    };
  }, []);
  useEffect(() => { if (!busy) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [busy]);
  useEffect(() => {
    if (stickRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    else setNewMessages(true);
  }, [messages, aiStatus]);
  useEffect(() => {
    if (!imageView) return;
    const key = (e: KeyboardEvent) => { if(e.key === 'Escape') setImageView(null); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [imageView]);

  const addImages = async (files: (File | Blob)[]) => {
    if (imageBusyRef.current) return;
    imageBusyRef.current = true; setImageBusy(true); setNotice('');
    const imgs: string[] = [];
    try {
      for (const f of files) {
        if (attachments.length + imgs.length >= MAX_IMAGES) { setNotice(`每条指令最多 ${MAX_IMAGES} 张参考图`); break; }
        if (!f.type.startsWith('image/')) continue;
        if (f.size > 20*1024*1024) { setNotice('单张图片不能超过 20 MB'); continue; }
        imgs.push(await compressImage(f));
      }
      if (aliveRef.current) setAttachments(prev => [...prev, ...imgs].slice(0,MAX_IMAGES));
    } catch { if(aliveRef.current) setNotice('图片处理失败，请换一张图片重试'); }
    finally { imageBusyRef.current = false; if(aliveRef.current) setImageBusy(false); }
  };
  const fail = (msg: string) => { finishRun('failed'); setAgentActivity(a=>a?{...a,timings:a.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))}:a); store().setPreviewDoc(null); store().setPendingBatch(null); store().setPendingResult(null); store().setAiError(msg); store().setAiStatus('error'); store().addAssistantMessage(msg, undefined, msg); };
  const finalize = (batch: CommandBatch, prepared?: ExecutionResult) => {
    setCompareBefore(false);store().setAiStatus('validating');
    if (store().doc.revision !== batch.baseRevision || store().doc.projectId !== batch.projectId) { fail('场景已变化，本次结果未应用。请重新发送'); return; }
    const result = prepared ?? applyBatch(store().doc, {operations:batch.operations});
    const scopeErrors=checkEditScope(store().doc,result.doc,batch.editScope);if(scopeErrors.length){fail(scopeErrors.join('；'));return;}
    if(result.errors.length) { fail(`结果未通过校验，场景保持不变：${result.errors.map(e=>e.message).join('；')}`); return; }
    store().setAiError(null);
    if (!batch.operations.length) { store().setPreviewDoc(null); store().setAiStatus('idle'); finishRun('completed'); store().addAssistantMessage(batch.summary); return; }
    const detail=evaluateDetailAcceptance(store().doc,result.doc,store().lastRun?.detailAcceptance?.reviews??[]);
    if(detail.issues.length){batch={...batch,qualityIssues:detail.issues,incomplete:true,continuation:batch.continuation??'继续按通用六项细节标准检查并修正当前模型'};}
    if(parentDraft.current&&batch.requestId!==parentDraft.current.batch.requestId){const priorId=parentDraft.current.batch.requestId;useEditorStore.setState(state=>({messages:state.messages.map(m=>m.batch?.requestId===priorId?{...m,outcome:'superseded' as const}:m)}));}
    store().setPendingBatch(batch); store().setPendingResult(result); store().setPreviewDoc(result.doc);
    store().setAiStatus('previewing'); finishRun('preview'); store().addAssistantMessage(batch.summary, batch);
  };
  const preserveCheckpoint = (reason:string) => {
    const cp=checkpointRef.current;
    if(!cp&&parentDraft.current&&parentDraft.current.batch.baseRevision===store().doc.revision&&parentDraft.current.batch.projectId===store().doc.projectId){const parent=parentDraft.current;store().setPendingBatch(parent.batch);store().setPendingResult(parent.result);store().setPreviewDoc(parent.result.doc);store().setAiStatus('previewing');finishRun('stopped');store().addAssistantMessage('本次调整未完成，之前的预览已保留。'+reason);return true;}
    if(!cp || cp.batch.baseRevision!==store().doc.revision || cp.batch.projectId!==store().doc.projectId)return false;
    const batch={...cp.batch,summary:cp.batch.summary+'\n中断原因：'+reason};
    const activity={...cp.activity,timings:cp.activity.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))};
    setAgentActivity(activity);store().setLastRun(activity);finalize(batch,cp.result);return true;
  };
  const send = async (sendMode:'guide'|'question'|'later'='guide') => {
    const text = input.trim();
    if ((!text && !attachments.length) || imageBusyRef.current) return;
    if(runningRef.current){
      if(sendMode==='later'){const id=store().addUserMessage(text||'请根据参考图建模',[...attachments]);useEditorStore.setState(state=>({messages:state.messages.map(m=>m.id===id?{...m,queuedTask:{status:'waiting' as const}}:m)}));setInput('');setAttachments([]);setNotice('已记为后续任务，不会影响当前执行；结束后可准备发送');return;}
      if(!controlRef.current){setNotice('当前请求暂不能接收引导，输入已保留；可停止后继续');return;}
      const id=store().addUserMessage(text||'请根据补充参考图调整',[...attachments]);markSteering(id,'queued');
      try{if(!controlRef.current.steer(id,text||'请根据补充参考图调整',[...attachments],sendMode)){useEditorStore.setState(state=>({messages:state.messages.filter(m=>m.id!==id)}));setNotice('当前任务已收尾，输入已保留，请直接发送下一条');return;}}catch{markSteering(id,'interrupted');setNotice('补充要求未送达，输入已保留');return;}
      setInput('');setAttachments([]);setNotice('补充要求已排队，当前操作结束后接收');stickRef.current=true;return;
    }
    const cfg = store().aiConfig;
    if(!cfg || cfg.useMock || !cfg.baseURL.trim() || !cfg.apiKey.trim() || !cfg.model.trim()) {
      setNotice('请先打开顶部“模型配置”，获取并选择模型；指令和图片已保留'); return;
    }
    const usePi = cfg.agentMode !== 'single';
    if(usePi && cfg.stream === false) { setNotice('Pi 分步建模需要流式输出，请在模型配置中开启；也可选择单次生成兼容模式'); return; }
    let requestedScope:EditScope;
    try{requestedScope=userEditScope(text,store().pendingResult?.doc??store().doc,[...store().selection],scopeMode,lockPlacement,messages.filter(m=>m.role==='user'));}
    catch(error){setNotice(error instanceof Error?error.message:'修改范围无效');return;}
    let lastActivitySave=0;
    const parent=store().aiStatus==='previewing'&&store().pendingBatch&&store().pendingResult?{batch:store().pendingBatch!,result:store().pendingResult!}:null;
    parentDraft.current=parent;
    const original=store().doc,working=parent?.result.doc??original;
    checkpointRef.current=null;setCompareBefore(false);store().setPreviewDoc(parent?.result.doc??null);
    if(!parent){store().setPendingBatch(null);store().setPendingResult(null);}
    setRunPi(usePi); setAgentActivity(null);store().setLastRun(null);
    const sentImages = [...attachments];
    // Current reference stays visible in the conversation; a follow-up may reuse the latest image.
    const reference = sentImages.length ? sentImages : reuseReference ? [...messages].reverse().find(m=>m.role==='user' && !m.queuedTask && m.images?.length)?.images ?? [] : [];
    const images = reference;
    const history = messages.filter(m=>m.role!=='system' && !m.error && !m.queuedTask).map(m=>({role:m.role as 'user'|'assistant',text:m.batch ? `${m.text}\n[${m.outcome==='applied'?'已应用':m.outcome==='discarded'?'已放弃，不要视作已存在':m.outcome==='superseded'?'已合并到后续草稿':'仅预览'}]` : m.text}));
    const myRun = ++runRef.current;
    const alive = () => aliveRef.current && myRun === runRef.current;
    runningRef.current = true; stickRef.current = true;
    setInput(''); setAttachments([]); setNotice(''); setLastRequest({text, images:sentImages});
    setStarted(Date.now()); setNow(Date.now()); setProgress(null);
    runMessageId.current=store().addUserMessage(text || '请根据参考图建模', sentImages);
    store().updateMessageRun(runMessageId.current,{startedAt:Date.now(),status:'running',mode:usePi?'pi':'single'});
    store().setAiError(null); store().setAiStatus('capturing');
    const baseRevision = working.revision;
    const projectId = working.projectId;
    const selectedIds = [...store().selection];
    const editScope:EditScope=requestedScope;
    if(lockPlacement&&!editScope.lockPlacement)setNotice('本次指令明确要求移动或旋转，临时按指令解除位置锁；默认开关未修改');
    const controller = new AbortController(); abortRef.current = controller;
    const armTimeout = () => {
      if(timeoutRef.current)clearTimeout(timeoutRef.current);
      timeoutRef.current=setTimeout(()=>{
        if(!alive())return;
        runRef.current++;runningRef.current=false;clearControl();controller.abort();abortRef.current=null;
        const reason=usePi?'连续3分钟没有收到模型或工具活动，已暂停；可保留草稿后继续':'等待超过 3 分钟，已停止本次接收';
        if(preserveCheckpoint(reason))return;
        fail(reason+'。场景未修改；服务端可能仍在处理');
      },usePi?AGENT_LIMITS.idleTimeoutMs:REQUEST_TIMEOUT_MS);
    };
    armTimeout();
    try {
      store().setAiStatus('context');
      const ctx = buildSceneContext(working, selectedIds,editScope);
      store().setAiStatus('generating');
      setProgress({phase:'waiting',attempt:1,characters:0,lastEventAt:Date.now(),streaming:cfg.stream !== false});
      let batch: CommandBatch;
      let prepared: ExecutionResult | undefined;
      if(usePi) {
        const {runModelingAgent} = await import('../ai/modelingAgent');
        if(!alive()) return;
        const generated = await runModelingAgent({text,config:cfg,document:working,qualityBaseline:parent?original:working,selection:selectedIds,images,history,signal:controller.signal,editScope,captureAvailable:()=>store().viewportStatus==='ready'||isServerCaptureAvailable()||isSoftwareCaptureAvailable(),
          onControl:control=>{if(alive()){controlRef.current=control;setCanSteer(!!control);if(!control)clearControl();}},
          onSteeringApplied:id=>{if(alive()){markSteering(id,'received');setNotice('补充要求已送入模型上下文');}},
          onCheckpoint:cp=>{if(alive()){const combined=continueDraft(original,parent,cp.batch,cp.result);checkpointRef.current={...cp,...combined};useEditorStore.setState({pendingBatch:combined.batch,pendingResult:combined.result});}},
          onActivity:event=>{if(alive()){armTimeout();setAgentActivity(event);if(Date.now()-lastActivitySave>=1000||/暂停|中断|工具失败/.test(event.title)){store().setLastRun(event);if(runMessageId.current)store().updateMessageRun(runMessageId.current,{activity:event});lastActivitySave=Date.now();}if(checkpointRef.current)checkpointRef.current.activity=event;}},onPreview:document=>{if(alive())store().setPreviewDoc(document);}});
        batch=generated.batch;prepared=generated.result;if(alive()){setAgentActivity(generated.activity);store().setLastRun(generated.activity);}
      } else {
        const generated = await generateBatch(text+`\n本次编辑范围约束：${JSON.stringify(editScope)}。${editScope.nodeIds?'只允许修改范围内对象；allowAssemblyAdditions=true时可给完整组件追加部件，不能新增其他组件或改范围外对象。':'允许编辑全场景。高亮对象只是指代参考，不是权限边界，不能因此拒绝其他对象的修改。'}${editScope.lockPlacement?'保留所有已有位置与朝向。':'遵守用户描述中的布局和局部修改要求。'}`, cfg, ctx, controller.signal, images, history, event => { if(alive()) setProgress(event); });
        batch = {requestId:makeId(),projectId,baseRevision,selectedIds,summary:generated.summary,operations:generated.operations};
      }
      batch.editScope=editScope;
      if(alive()&&parent&&!batch.operations.length){store().setPendingBatch(parent.batch);store().setPendingResult(parent.result);store().setPreviewDoc(parent.result.doc);store().setAiStatus('previewing');finishRun('completed');store().addAssistantMessage(batch.summary);parentDraft.current=null;return;}
      if(alive()){const combined=continueDraft(original,parent,batch,prepared);finalize(combined.batch,combined.result);parentDraft.current=null;}
    } catch(e) {
      if(alive() && !preserveCheckpoint(e instanceof Error?e.message:'请求中断')) fail(e instanceof TypeError && /fetch/i.test(e.message) ? '无法读取接口响应，请检查网络或网关跨域配置。场景未修改' : `生成未完成：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if(alive()) { clearControl();runningRef.current=false; abortRef.current=null; if(timeoutRef.current) clearTimeout(timeoutRef.current); inputRef.current?.focus(); }
    }
  };
  const cancel = () => {
    setAgentActivity(a=>a?{...a,timings:a.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))}:a);
    runRef.current++; runningRef.current=false; clearControl();abortRef.current?.abort(); abortRef.current=null;
    if(timeoutRef.current) clearTimeout(timeoutRef.current);
    if(preserveCheckpoint('你已停止生成；保留草稿不会继续调用模型')){setNotice('已停止，阶段草稿仍可查看。继续生成需另行发送指令');return;}
    finishRun('stopped');
    { store().setAiStatus('cancelled'); store().setPreviewDoc(null); } store().setAiError(null);
    setNotice('已停止接收，场景未修改。服务端可能仍在处理，取消不保证退还用量');
    inputRef.current?.focus();
  };
  const restore = () => {
    if(!lastRequest) return;
    if(input.trim() || attachments.length) { setNotice('请先处理当前草稿，再恢复上一条指令'); return; }
    setInput(lastRequest.text); setAttachments(lastRequest.images); setNotice('已恢复，请按需修改后发送'); inputRef.current?.focus();
  };

  const commit = () => {store().confirmPending();if(store().aiStatus==='idle')setNotice('修改已应用到当前项目；可撤销。不会继续调用模型。');checkpointRef.current=null;parentDraft.current=null;inputRef.current?.focus();};
  const discard = () => {checkpointRef.current=null;parentDraft.current=null;store().discardPending(); setNotice('已放弃预览，原场景保持不变'); inputRef.current?.focus();};
  const previewCard=(previewing && pendingBatch && <div className="mx-3 mb-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="text-emerald-300 text-sm font-medium">{pendingBatch.taskStatus==='partial'?'本次任务中断 · 已保留部分修改':'本次修改已生成 · 等待应用'} · {pendingBatch.operations.length} 项操作</div>
      <p className="text-xs text-gray-300 mt-1">应用后写入当前项目，可撤销；继续调整会在当前预览上修改。</p>
      {(pendingBatch.incomplete||viewportStatus!=='ready')&&<details className="mt-2 text-xs text-amber-200"><summary>模型质量：尚有待核对项（不等于本次修改失败）</summary><p className="mt-2">{viewportStatus!=='ready'?'实时三维画面不可用，尚不能完成真实材质与交互验收。':''}应用修改不会将模型质量标为通过。</p>{!!pendingBatch.qualityIssues?.length&&<ul className="mt-2 space-y-1">{[...new Set(pendingBatch.qualityIssues)].map((issue,i)=><li key={i}>{issue}</li>)}</ul>}</details>}

      {pendingResult&&<div className="mt-3 border-t border-white/10 pt-2 text-xs text-gray-300"><p>修改对比：新增 {changes.filter(c=>c.kind==='added').length} · 修改 {changes.filter(c=>c.kind==='modified').length} · 移除 {changes.filter(c=>c.kind==='removed').length}</p><details className="mt-2"><summary className="cursor-pointer">查看受影响对象</summary><ul className="max-h-40 overflow-auto mt-1 space-y-1">{changes.map(c=><li key={c.id}><button className="text-left hover:text-blue-200 disabled:opacity-50" disabled={!pendingResult.doc.nodes.some(n=>n.id===c.id)} onClick={()=>store().select([c.id])}>{c.group} / {c.name}：{c.fields.join('、')}</button></li>)}</ul></details><button className="mt-2 rounded bg-white/10 px-2 py-1" onClick={()=>{const before=!compareBefore;setCompareBefore(before);store().setPreviewDoc(before?doc:pendingResult.doc);}}>{compareBefore?'查看修改后':'查看修改前'}</button>{compareBefore&&<p className="mt-1 text-amber-200">当前显示修改前，请切回修改后再确认应用</p>}</div>}
      <button className="mt-3 text-xs text-blue-300" onClick={()=>{if(!input.trim()&&pendingBatch.continuation)setInput(pendingBatch.continuation);inputRef.current?.focus();}}>继续调整</button>
      <div className="flex gap-2 mt-3"><button disabled={compareBefore} onClick={commit} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded py-2 text-sm">应用修改</button><button onClick={discard} className="px-3 bg-white/10 rounded text-sm">放弃修改</button></div>
    </div>);
  return <div className="chat-panel flex flex-col h-full min-w-0 bg-[#20242b] text-gray-200">
    <div title="会话在本浏览器保存；请下载项目文件长期备份" className="px-3 py-2 border-b border-white/10 text-xs text-gray-400 flex justify-between gap-2">
      <span className="truncate">{!aiConfig?.useMock && aiConfig?.agentMode !== 'single' ? 'Pi · ' : ''}{aiConfig?.useMock ? '请先配置模型' : aiConfig?.model || '请先配置模型'}</span>
      <span className="shrink-0">{selection.length ? `已选 ${selection.length} 个对象` : `场景 ${doc.nodes.length} 个对象`}</span>
    </div>
    <div ref={scrollRef} onScroll={() => {const el=scrollRef.current; if(el) {stickRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;if(stickRef.current)setNewMessages(false);}}} className="chat-transcript flex-1 overflow-auto p-3 space-y-4 min-h-0">
      {!messages.length && <div className="chat-welcome text-sm text-gray-400 py-5 leading-relaxed">
        <p className="text-gray-200 font-medium mb-2">{doc.nodes.length?'从现有模型继续':'从一个想法开始'}</p>

        <p>{doc.nodes.length?'可以选择对象后修改尺寸、颜色和位置，或描述要追加的模型。修改会先预览，应用后可撤销。':'先创建单个模型，也可以从已有资产组合场景。说明用途、尺寸和需要保留的细节。'}</p>
        <button className="mt-3 text-blue-300 text-left" onClick={()=>setInput('创建一个长 1.2 米、宽 0.8 米、高 0.75 米的工作台')}>试试：创建一个有明确尺寸的工作台 ↗</button>
        {!doc.nodes.length&&<button className="mt-2 text-blue-300 text-left" onClick={()=>setInput('创建一个小型仓储场景，包含货架、周转箱和一条清晰通道；先给出布局和尺寸假设，再生成可编辑模型')}>组合一个场景 ↗</button>}
        {onAssets&&<button className="mt-2 text-blue-300 text-left" onClick={onAssets}>从资产库开始 ↗</button>}
        <p className="mt-3 text-xs">图片建模是可编辑的近似重建，单张图无法确定背面与真实尺寸。</p>
      </div>}
      {(!aiConfig || aiConfig.useMock)&&<p className="text-xs text-amber-200 p-2">请连接真实模型后生成。已有项目仍可打开、手动编辑、保存和导出。<button onClick={onConfigure} className="ml-2 underline">连接模型</button></p>}
      {messages.map(m=><div key={m.id}><div className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
        <div className={`chat-message ${m.role==='user'?'chat-message-user':'chat-message-assistant'} max-w-[94%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${m.role==='user'?'bg-blue-600 text-white':m.error?'bg-red-950/50 border border-red-500/30 text-red-200':'bg-[#2c323b]'}`}>
          <div className="text-[10px] opacity-60 mb-1">{m.role==='user'?'你':'chat3d'} · {new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          {!!m.images?.length && <div className="flex flex-wrap gap-2 mb-2">{m.images.map((src,i)=><button key={i} onClick={()=>setImageView(src)} title="放大参考图"><img src={src} alt={`参考图 ${i+1}`} className="w-20 h-16 rounded object-cover"/></button>)}</div>}
          <MessageText text={m.text}/>
          {m.queuedTask&&<div className="mt-2 text-xs">{m.queuedTask.status==='waiting'?'后续任务 · 尚未执行':'后续任务 · 已放入输入框，尚未发送'}<button disabled={busy} className="ml-2 underline disabled:opacity-40" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容');return;}setInput(m.text);setAttachments(m.images??[]);useEditorStore.setState(state=>({messages:state.messages.map(item=>item.id===m.id?{...item,queuedTask:{status:'prepared' as const}}:item)}));inputRef.current?.focus();}}>准备发送</button></div>}
          {m.steering&&<div className="mt-1 text-xs opacity-75">{m.steering.status==='queued'?'补充要求 · 等待接收':m.steering.status==='received'?'补充要求 · 已送入模型上下文':'补充要求 · 未送达，可重新发送'}{m.steering.status==='interrupted'&&<button className="ml-2 underline" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容，再恢复补充要求');return;}setInput(m.text);setAttachments(m.images??[]);inputRef.current?.focus();}}>恢复补充要求</button>}</div>}
          {m.batch && <div className="mt-2 text-xs text-emerald-300">{m.outcome==='applied'?'✓ 已应用 · 可用工具栏撤销':m.outcome==='discarded'?'已放弃 · 未修改场景':m.outcome==='superseded'?'已合并到后续预览':pendingBatch?.requestId===m.batch.requestId?'待确认 · 当前画面是预览':'预览已结束'}</div>}
        </div>
      </div>
      {m.run&&['failed','stopped'].includes(m.run.status)&&!busy&&<button className="mt-1 text-xs text-blue-300 underline" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容');return;}setInput(m.text);setAttachments(m.images??[]);inputRef.current?.focus();}}>恢复本轮指令</button>}
      {m.run&&<ConversationRun run={m.run} activity={busy&&m.id===runMessageId.current?agentActivity:undefined} onStop={busy&&m.id===runMessageId.current?cancel:undefined}/>}
      {previewing&&m.batch?.requestId===pendingBatch?.requestId&&previewCard}
      </div>)}
    {(aiStatus==='error' || aiStatus==='cancelled') && <div className="px-3 pb-2 text-xs" role="status"><span className="text-amber-300">{aiStatus==='error'?'本次未完成，原场景未修改':'已停止生成'}</span>{lastRequest && <button onClick={restore} className="ml-3 text-blue-300 underline">恢复指令重试</button>}{aiError && <details className="mt-1 text-gray-400"><summary>错误详情</summary><p className="select-text break-words whitespace-pre-wrap">{aiError}</p></details>}</div>}
      {previewing&&!messages.some(m=>m.batch?.requestId===pendingBatch?.requestId)&&previewCard}
    </div>
    <SiteAccessRecovery error={aiError}/>
    {newMessages && <button className="text-xs text-blue-300 py-1" onClick={()=>{stickRef.current=true;setNewMessages(false);if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;}}>查看最新消息 ↓</button>}
    {notice && <div role="status" className="px-3 py-2 text-xs text-amber-200">{notice}</div>}
    {busy && agentActivity && (agentActivity.inputTokens+agentActivity.outputTokens>=100000 || elapsed>=300) && <p role="status" className="px-3 pb-2 text-xs text-amber-300">任务耗时较长，详情见任务记录。可随时停止并保留已生成草稿。</p>}
    {!!attachments.length && <div className="flex gap-2 p-2 flex-wrap">{attachments.map((src,i)=><div key={i} className="relative"><button onClick={()=>setImageView(src)}><img src={src} alt={`待发送参考图 ${i+1}`} className="w-16 h-14 rounded object-cover"/></button><button aria-label={`移除参考图 ${i+1}`} onClick={()=>setAttachments(prev=>prev.filter((_,j)=>i!==j))} className="absolute -top-1 -right-1 rounded-full bg-red-600 w-5 h-5 text-xs">×</button></div>)}</div>}
    {doc.nodes.length>0&&<fieldset disabled={busy} className="edit-scope-controls mx-3 mb-2 space-y-2 text-xs text-gray-200 disabled:opacity-50"><label className="flex items-center justify-between gap-2">修改范围<select aria-label="对话修改范围" value={scopeMode} onChange={e=>setScopeMode(e.target.value as 'scene'|'selection')} className="rounded bg-[#252A31] border border-white/20 px-2 py-1"><option value="scene">全场景</option><option value="selection">仅选中对象（{selection.length}）</option></select></label><p>{scopeMode==='selection'?(selection.length?`仅允许修改选中的 ${selection.length} 个零件；其他对象受保护。`:'请先在对象列表中选择对象，再发送指令。'):'可以修改全场景；选中对象仅用于指代，仍遵守指令中的局部限制。'}</p><details><summary>更多修改选项</summary><label className="flex gap-2 items-center mt-2"><input type="checkbox" checked={lockPlacement} onChange={e=>setLockPlacement(e.target.checked)}/>锁定已有对象的位置与朝向</label></details></fieldset>}
    <div className="chat-composer p-3 border-t border-white/10 bg-[#252A31]">

      <TextArea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} aria-label="建模指令" rows={3}
        onPaste={e=>{const items=Array.from(e.clipboardData.items).filter(it=>it.type.startsWith('image/'));if(items.length){e.preventDefault();void addImages(items.map(it=>it.getAsFile()).filter((f): f is File=>!!f));}}}
        onCompositionStart={()=>composingRef.current=true} onCompositionEnd={()=>composingRef.current=false}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!composingRef.current&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy||canSteer)void send();}}}
        placeholder={busy ? canSteer?'补充要求、纠正方向或提问，当前操作结束后接收…':'正在准备，可先输入补充要求…' : previewing?'继续描述调整要求，将修改当前预览…': '描述结构、尺寸与需要修改的细节…'}
        className="w-full bg-black/20 border border-white/15 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-400"/>
      <div className="flex items-center justify-between gap-2 mt-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{void addImages(Array.from(e.target.files??[]));e.target.value='';}}/>
        <Button variant="soft" color="gray" disabled={imageBusy||attachments.length>=MAX_IMAGES} onClick={()=>fileRef.current?.click()} className="text-xs text-gray-300 disabled:opacity-40">{imageBusy?'处理图片…':`＋ 参考图 ${attachments.length}/${MAX_IMAGES}`}</Button>
        <span className="text-[10px] text-gray-500">{busy&&runPi?'Enter 引导 · Shift+Enter 换行':'Shift+Enter 换行'}</span>
        {busy&&runPi?<div className="flex flex-wrap justify-end gap-2" aria-label="运行中操作"><Button variant="soft" color="gray" title="当前操作结束后，将补充要求交给模型调整任务" onClick={()=>void send('guide')} disabled={!canSteer||imageBusy||(!input.trim()&&!attachments.length)} className="asset-button">发送引导</Button><Button variant="soft" color="gray" title="交给模型回答，禁止修改场景" onClick={()=>void send('question')} disabled={!canSteer||imageBusy||(!input.trim()&&!attachments.length)} className="asset-button">发送问题</Button><Button variant="soft" color="gray" title="只保存任务，当前任务结束后由你发送" onClick={()=>void send('later')} disabled={imageBusy||(!input.trim()&&!attachments.length)} className="asset-button">保存后续任务</Button></div>:<Button variant="solid" onClick={()=>void send()} disabled={busy||imageBusy||(!input.trim()&&!attachments.length)} className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm">{busy?'等待当前请求':'发送'}</Button>}
      </div>
      {!attachments.length && messages.some(m=>m.images?.length) && <label className="flex items-center gap-2 text-[11px] text-gray-400 mt-2"><input type="checkbox" checked={reuseReference} onChange={e=>setReuseReference(e.target.checked)}/>沿用最近参考图（新建无关模型时可取消）</label>}
    </div>
    {imageView && <div role="dialog" aria-modal="true" aria-label="参考图预览" onKeyDown={e=>{if(e.key==='Tab')e.preventDefault();}} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-10" onClick={()=>setImageView(null)}><img src={imageView} alt="参考图大图" className="max-h-full max-w-full object-contain" onClick={e=>e.stopPropagation()}/><button autoFocus aria-label="关闭参考图" onClick={()=>setImageView(null)} className="absolute right-6 top-5 text-white text-2xl">×</button></div>}
  </div>;
}
