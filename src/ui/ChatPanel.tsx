import { useEffect, useMemo, useRef, useState } from 'react';
import { buildBatch } from '../ai/mockModel';
import { buildSceneContext, generateBatch } from '../ai/provider';
import { GenerationProgress } from '../ai/stream';
import type { AgentActivity, AgentResult } from '../ai/modelingAgent';
import { AGENT_LIMITS } from '../ai/agentPolicy';
import { applyBatch, CommandBatch, ExecutionResult } from '../domain/commands';
import {checkEditScope,sceneChanges,type EditScope} from '../domain/editScope';
import { makeId } from '../util/ids';
import { useEditorStore } from '../store';

const MAX_IMAGES = 4;
export const REQUEST_TIMEOUT_MS = 180_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
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

export function ChatPanel({executionDetails=true}:{executionDetails?:boolean}={}) {
  const { messages, aiStatus, aiError, pendingBatch, pendingResult, aiConfig, selection, doc } = useEditorStore();
  const store = useEditorStore.getState;
  const input=useEditorStore(s=>s.composerText);
  const setInput=(text:string)=>store().setComposerText(text);
  const attachments=useEditorStore(s=>s.composerImages);
  const setAttachments=(value:string[]|((previous:string[])=>string[]))=>store().setComposerImages(typeof value==='function'?value(store().composerImages):value);
  const [onlySelected,setOnlySelected]=useState(true);
  const [allowAssemblyAdditions,setAllowAssemblyAdditions]=useState(true);
  const [lockPlacement,setLockPlacement]=useState(false);
  const [compareBefore,setCompareBefore]=useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [agentActivity, setAgentActivity] = useState<AgentActivity | null>(()=>store().lastRun);
  const [runPi, setRunPi] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
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
  const previewing = aiStatus === 'previewing';
  const changes=useMemo(()=>previewing&&pendingResult?sceneChanges(doc,pendingResult.doc):[],[previewing,doc,pendingResult]);
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));
  const quiet = agentActivity ? Math.max(0, Math.floor((now-agentActivity.lastEventAt)/1000)) : progress ? Math.max(0, Math.floor((now - progress.lastEventAt) / 1000)) : elapsed;
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
  }, [messages.length, aiStatus]);
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
  const fail = (msg: string) => { setAgentActivity(a=>a?{...a,timings:a.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))}:a); store().setPreviewDoc(null); store().setPendingBatch(null); store().setPendingResult(null); store().setAiError(msg); store().setAiStatus('error'); store().addAssistantMessage(msg, undefined, msg); };
  const finalize = (batch: CommandBatch, prepared?: ExecutionResult) => {
    setCompareBefore(false);store().setAiStatus('validating');
    if (store().doc.revision !== batch.baseRevision || store().doc.projectId !== batch.projectId) { fail('场景已变化，本次结果未应用。请重新发送'); return; }
    const result = prepared ?? applyBatch(store().doc, {operations:batch.operations});
    const scopeErrors=checkEditScope(store().doc,result.doc,batch.editScope);if(scopeErrors.length){fail(scopeErrors.join('；'));return;}
    if(result.errors.length) { fail(`结果未通过校验，场景保持不变：${result.errors.map(e=>e.message).join('；')}`); return; }
    store().setAiError(null);
    if (!batch.operations.length) { store().setPreviewDoc(null); store().setAiStatus('idle'); store().addAssistantMessage(batch.summary); return; }
    store().setPendingBatch(batch); store().setPendingResult(result); store().setPreviewDoc(result.doc);
    store().setAiStatus('previewing'); store().addAssistantMessage(batch.summary, batch);
  };
  const preserveCheckpoint = (reason:string) => {
    const cp=checkpointRef.current;
    if(!cp || cp.batch.baseRevision!==store().doc.revision || cp.batch.projectId!==store().doc.projectId)return false;
    const batch={...cp.batch,summary:cp.batch.summary+'\n中断原因：'+reason};
    const activity={...cp.activity,timings:cp.activity.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))};
    setAgentActivity(activity);store().setLastRun(activity);finalize(batch,cp.result);return true;
  };
  const send = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || runningRef.current || previewing || imageBusyRef.current) return;
    const cfg = store().aiConfig;
    if(!cfg || (!cfg.useMock && (!cfg.baseURL.trim() || !cfg.apiKey.trim() || !cfg.model.trim()))) {
      setNotice('请先打开顶部“模型配置”，获取并选择模型；指令和图片已保留'); return;
    }
    if(cfg.useMock && attachments.length) { setNotice('离线演示不能识别参考图，请先配置支持看图的模型'); return; }
    const usePi = !cfg.useMock && cfg.agentMode !== 'single';
    if(usePi && cfg.stream === false) { setNotice('Pi 分步建模需要流式输出，请在模型配置中开启；也可选择单次生成兼容模式'); return; }
    let lastActivitySave=0;
    checkpointRef.current=null;store().setPendingBatch(null);store().setPendingResult(null);
    setRunPi(usePi); setAgentActivity(null);store().setLastRun(null);
    const sentImages = [...attachments];
    // Current reference stays visible in the conversation; a follow-up may reuse the latest image.
    const reference = sentImages.length ? sentImages : reuseReference ? [...messages].reverse().find(m=>m.role==='user' && m.images?.length)?.images ?? [] : [];
    const images = cfg.useMock ? [] : reference;
    const history = messages.filter(m=>m.role!=='system' && !m.error).map(m=>({role:m.role as 'user'|'assistant',text:m.batch ? `${m.text}\n[${m.outcome==='applied'?'已应用':m.outcome==='discarded'?'已放弃，不要视作已存在':'仅预览'}]` : m.text}));
    const myRun = ++runRef.current;
    const alive = () => aliveRef.current && myRun === runRef.current;
    runningRef.current = true; stickRef.current = true;
    setInput(''); setAttachments([]); setNotice(''); setLastRequest({text, images:sentImages});
    setStarted(Date.now()); setNow(Date.now()); setProgress(null);
    store().addUserMessage(text || '请根据参考图建模', sentImages);
    store().setAiError(null); store().setAiStatus('capturing');
    const baseRevision = store().doc.revision;
    const projectId = store().doc.projectId;
    const selectedIds = [...store().selection];
    const editScope:EditScope={...(onlySelected&&selectedIds.length?{nodeIds:selectedIds,allowAssemblyAdditions}:{}),...(lockPlacement?{lockPlacement:true}:{})};
    const controller = new AbortController(); abortRef.current = controller;
    const armTimeout = () => {
      if(timeoutRef.current)clearTimeout(timeoutRef.current);
      timeoutRef.current=setTimeout(()=>{
        if(!alive())return;
        runRef.current++;runningRef.current=false;controller.abort();abortRef.current=null;
        const reason=usePi?'连续3分钟没有收到模型或工具活动，已暂停；可保留草稿后继续':'等待超过 3 分钟，已停止本次接收';
        if(preserveCheckpoint(reason))return;
        fail(reason+'。场景未修改；服务端可能仍在处理');
      },usePi?AGENT_LIMITS.idleTimeoutMs:REQUEST_TIMEOUT_MS);
    };
    armTimeout();
    try {
      store().setAiStatus('context');
      const ctx = buildSceneContext(store().doc, selectedIds);
      store().setAiStatus('generating');
      setProgress({phase:'waiting',attempt:1,characters:0,lastEventAt:Date.now(),streaming:cfg.stream !== false});
      let batch: CommandBatch;
      let prepared: ExecutionResult | undefined;
      if (cfg.useMock) {
        await sleep(500); if(!alive()) return; batch = buildBatch(text);
      } else if(usePi) {
        const {runModelingAgent} = await import('../ai/modelingAgent');
        if(!alive()) return;
        const generated = await runModelingAgent({text,config:cfg,document:store().doc,selection:selectedIds,images,history,signal:controller.signal,editScope,
          onCheckpoint:cp=>{if(alive()){checkpointRef.current=cp;useEditorStore.setState({pendingBatch:cp.batch,pendingResult:cp.result});}},
          onActivity:event=>{if(alive()){armTimeout();setAgentActivity(event);if(Date.now()-lastActivitySave>=1000||/暂停|中断|工具失败/.test(event.title)){store().setLastRun(event);lastActivitySave=Date.now();}if(checkpointRef.current)checkpointRef.current.activity=event;}},onPreview:document=>{if(alive())store().setPreviewDoc(document);}});
        batch=generated.batch;prepared=generated.result;if(alive()){setAgentActivity(generated.activity);store().setLastRun(generated.activity);}
      } else {
        const generated = await generateBatch(text+`\n本次编辑范围约束：${JSON.stringify(editScope)}。nodeIds限定修改范围；allowAssemblyAdditions=true时可向完整选中的组件追加部件，不可新建其他组件；lockPlacement需保持所有已有位置和朝向。`, cfg, ctx, controller.signal, images, history, event => { if(alive()) setProgress(event); });
        batch = {requestId:makeId(),projectId,baseRevision,selectedIds,summary:generated.summary,operations:generated.operations};
      }
      batch.editScope=editScope;
      if(alive()) finalize(batch,prepared);
    } catch(e) {
      if(alive() && !preserveCheckpoint(e instanceof Error?e.message:'请求中断')) fail(e instanceof TypeError && /fetch/i.test(e.message) ? '无法读取接口响应，请检查网络或网关跨域配置。场景未修改' : `生成未完成：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if(alive()) { runningRef.current=false; abortRef.current=null; if(timeoutRef.current) clearTimeout(timeoutRef.current); inputRef.current?.focus(); }
    }
  };
  const cancel = () => {
    setAgentActivity(a=>a?{...a,timings:a.timings.map(t=>({...t,endedAt:t.endedAt??Date.now()}))}:a);
    runRef.current++; runningRef.current=false; abortRef.current?.abort(); abortRef.current=null;
    if(timeoutRef.current) clearTimeout(timeoutRef.current);
    if(preserveCheckpoint('你已停止生成；保留草稿不会继续调用模型')){setNotice('已停止，阶段草稿仍可查看。继续生成需另行发送指令');return;}
    { store().setAiStatus('cancelled'); store().setPreviewDoc(null); } store().setAiError(null);
    setNotice('已停止接收，场景未修改。服务端可能仍在处理，取消不保证退还用量');
    inputRef.current?.focus();
  };
  const restore = () => {
    if(!lastRequest) return;
    if(input.trim() || attachments.length) { setNotice('请先处理当前草稿，再恢复上一条指令'); return; }
    setInput(lastRequest.text); setAttachments(lastRequest.images); setNotice('已恢复，请按需修改后发送'); inputRef.current?.focus();
  };
  const progressTitle = runPi && agentActivity ? agentActivity.title : aiConfig?.useMock ? '正在生成离线演示结果' : progress?.phase==='correcting' ? '正在请求修正输出格式（第 2 次）' : progress?.phase==='validating' || aiStatus==='validating' ? '回复已收齐，正在校验模型结构' : progress?.phase==='receiving' ? progress.characters ? '正在接收模型输出' : '服务已响应，等待答案内容' : '请求已发起，等待模型响应';
  const commit = () => {const continuation=store().pendingBatch?.continuation;store().confirmPending();if(store().aiStatus==='idle' && continuation){if(!store().composerText.trim()){setInput(continuation);setNotice('阶段已保留，继续指令已填入；点击发送才会继续调用模型');}else setNotice('阶段已保留；当前输入草稿未改动，可以发送指令继续完善');}checkpointRef.current=null; inputRef.current?.focus();};
  const discard = () => {checkpointRef.current=null;store().discardPending(); setNotice('已放弃预览，原场景保持不变'); inputRef.current?.focus();};
  return <div className="chat-panel flex flex-col h-full min-w-0 bg-[#20242b] text-gray-200">
    <div title="会话在本浏览器保存；请下载项目文件长期备份" className="px-3 py-2 border-b border-white/10 text-xs text-gray-400 flex justify-between gap-2">
      <span className="truncate">{!aiConfig?.useMock && aiConfig?.agentMode !== 'single' ? 'Pi · ' : ''}{aiConfig?.useMock ? '离线演示 · 模拟结果' : aiConfig?.model || '请先配置模型'}</span>
      <span className="shrink-0">{selection.length ? `已选 ${selection.length} 个对象` : `场景 ${doc.nodes.length} 个对象`}</span>
    </div>
    <div ref={scrollRef} onScroll={() => {const el=scrollRef.current; if(el) {stickRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;if(stickRef.current)setNewMessages(false);}}} className="chat-transcript flex-1 overflow-auto p-3 space-y-4 min-h-0">
      {!messages.length && <div className="chat-welcome text-sm text-gray-400 py-5 leading-relaxed">
        <p className="text-gray-200 font-medium mb-2">从一个想法开始</p>
        <p>可以附参考图，说明尺寸、用途和需要保留的细节。也可以通过对话给现有场景添加运动，先播放预览，再决定应用。</p>
        <button className="mt-3 text-blue-300 text-left" onClick={()=>setInput('创建一个长 1.2 米、宽 0.8 米、高 0.75 米的工作台')}>试试：创建一个有明确尺寸的工作台 ↗</button>
        <p className="mt-3 text-xs">图片建模是可编辑的近似重建，单张图无法确定背面与真实尺寸。</p>
      </div>}
      {messages.map(m=><div key={m.id} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
        <div className={`chat-message ${m.role==='user'?'chat-message-user':'chat-message-assistant'} max-w-[94%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${m.role==='user'?'bg-blue-600 text-white':m.error?'bg-red-950/50 border border-red-500/30 text-red-200':'bg-[#2c323b]'}`}>
          <div className="text-[10px] opacity-60 mb-1">{m.role==='user'?'你':'chat3d'} · {new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          {!!m.images?.length && <div className="flex flex-wrap gap-2 mb-2">{m.images.map((src,i)=><button key={i} onClick={()=>setImageView(src)} title="放大参考图"><img src={src} alt={`参考图 ${i+1}`} className="w-20 h-16 rounded object-cover"/></button>)}</div>}
          <div className="whitespace-pre-wrap break-words select-text">{m.text}</div>
          {m.batch && <div className="mt-2 text-xs text-emerald-300">{m.outcome==='applied'?'✓ 已应用 · 可用工具栏撤销':m.outcome==='discarded'?'已放弃 · 未修改场景':pendingBatch?.requestId===m.batch.requestId?'待确认 · 当前画面是预览':'预览已结束'}</div>}
        </div>
      </div>)}
    </div>
    {newMessages && <button className="text-xs text-blue-300 py-1" onClick={()=>{stickRef.current=true;setNewMessages(false);if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;}}>查看最新消息 ↓</button>}
    {busy && <div className="mx-3 mb-2 p-3 rounded-xl border border-blue-400/25 bg-blue-500/5">
      <div role="status" aria-live="polite" className="text-sm text-blue-200">{progressTitle}</div>
      <div className="flex justify-between mt-2 text-xs text-gray-400"><span>已等待 {elapsed} 秒{agentActivity ? ` · 第 ${agentActivity.turn} 轮` : ''}{progress?.attempt === 2 ? ' · 格式纠正 2/2' : ''}{(agentActivity?.characters ?? progress?.characters) ? ` · 收到 ${(agentActivity?.characters ?? progress?.characters ?? 0).toLocaleString()} 字符` : ''}</span><button onClick={cancel} className="text-gray-100 hover:text-red-300">停止生成</button></div>
      <p className="mt-2 text-xs text-gray-400">{quiet>=30 ? `已有 ${quiet} 秒未收到新内容，可能排队、计算中或连接停滞；${3} 分钟后自动停止，可随时取消。` : progress && !progress.streaming ? '服务返回非流式响应，需等待完整答案；暂时无法显示中间进度。' : '完成后先预览，你确认应用前不会修改原场景。'}</p>
    </div>}
    {executionDetails&&agentActivity?.design&&<details className="mx-3 mb-2 rounded border border-blue-300/20 p-3 text-xs text-gray-300"><summary className="cursor-pointer text-blue-200">本次设计方案 · {agentActivity.design.equipment.length} 类设备</summary><p className="mt-2">工艺：{agentActivity.design.flow.join(' → ')}</p><p className="mt-2">布局：{agentActivity.design.layout}</p><ul className="mt-2 space-y-1">{agentActivity.design.equipment.map((e,i)=><li key={i}>{e.name} × {e.count}：{e.features.join('、')}</li>)}</ul><p className="mt-2">检查：{agentActivity.design.checks.join('；')}</p>{agentActivity.design.composition&&<><p className="mt-2">分区：{agentActivity.design.composition.zones.map(z=>z.name+'：'+z.purpose).join('；')}</p><p className="mt-2">连接：{agentActivity.design.composition.connections.map(c=>c.from+' → '+c.to+'（'+c.via+'）').join('；')||'未要求固定连接'}</p><p className="mt-2">配套：{agentActivity.design.composition.support.map(e=>e.name+' × '+e.count+'：'+e.purpose).join('；')||'未规划额外配套'}</p><p className="mt-2">观感：{agentActivity.design.composition.palette.join('、')}；{agentActivity.design.composition.presentation}</p></>}</details>}
    {executionDetails&&agentActivity?.quality&&<details className="mx-3 mb-2 rounded border border-amber-300/20 p-3 text-xs text-gray-300"><summary className="cursor-pointer text-amber-200">场景检查 · {agentActivity.quality.issues.length} 项待核对</summary><p className="mt-2">{agentActivity.quality.componentCount} 个组件 · 检查版本 {agentActivity.quality.revision}{pendingResult&&pendingResult.doc.revision!==agentActivity.quality.revision?' · 场景已修改，需重新检查':''}</p><ul className="mt-2 space-y-1">{agentActivity.quality.coverage.map((c,i)=><li key={i}>{c.name}：已关联 {c.actual} / 计划 {c.expected}</li>)}</ul><ul className="mt-2 space-y-1">{agentActivity.quality.issues.map((issue,i)=><li key={i}>• {issue}</li>)}</ul><p className="mt-2 text-gray-400">这是清单和几何线索检查；仍需视觉核对实际连接、工艺合理性和画面效果。</p></details>}
    {executionDetails&&agentActivity && <details className="run-details mx-3 mb-2 rounded-lg border border-white/10 px-3 py-2 text-xs">
      <summary className="text-blue-200 cursor-pointer">Pi 执行记录 · {agentActivity.turn} 轮模型 · {agentActivity.toolCalls} 次工具{agentActivity.usageReported ? ` · 输入 ${agentActivity.inputTokens.toLocaleString()} / 输出 ${agentActivity.outputTokens.toLocaleString()} Token` : ' · 用量尚未报告'}</summary>
      <div className="mt-2 border-b border-white/10 pb-2 max-h-40 overflow-auto space-y-1 text-gray-400">{agentActivity.timings.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-x-2"><span>{t.label}</span><span>{((Math.max(t.endedAt??now,t.startedAt)-t.startedAt)/1000).toFixed(1)}秒{t.endedAt===undefined?' · 进行中':''}{t.kind==='model'&&t.firstDataAt!==undefined?` · 首数据 ${((t.firstDataAt-t.startedAt)/1000).toFixed(1)}秒`:''}</span></div>)}</div>
      {!!agentActivity.plan.length && <ol className="mt-2 space-y-1 text-gray-400">{agentActivity.plan.map((p,i)=><li key={i}>{i+1}. {p}</li>)}</ol>}
      <div className="max-h-36 overflow-auto mt-2 space-y-1 text-gray-300 select-text">{agentActivity.events.map((e,i)=><p key={i}>{e}</p>)}</div>
    </details>}
    {previewing && pendingBatch && <div className="mx-3 mb-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="text-emerald-300 text-sm font-medium">{pendingBatch.incomplete?'阶段草稿 · 未完成复核':'预览已就绪'} · {pendingBatch.operations.length} 项操作</div>
      <p className="text-xs text-gray-400 mt-1">{pendingBatch.incomplete?'这不是完整交付。可旋转检查，保留此阶段后继续；保留操作可撤销，不会自动发送请求。':'可旋转、缩放查看。请先应用或放弃，再发送下一条；下方可以先写草稿。'}</p>
      {pendingResult&&<div className="mt-3 border-t border-white/10 pt-2 text-xs text-gray-300"><p>修改对比：新增 {changes.filter(c=>c.kind==='added').length} · 修改 {changes.filter(c=>c.kind==='modified').length} · 移除 {changes.filter(c=>c.kind==='removed').length}</p><details className="mt-2"><summary className="cursor-pointer">查看受影响对象</summary><ul className="max-h-40 overflow-auto mt-1 space-y-1">{changes.map(c=><li key={c.id}>{c.group} / {c.name}：{c.fields.join('、')}</li>)}</ul></details><button className="mt-2 rounded bg-white/10 px-2 py-1" onClick={()=>{const before=!compareBefore;setCompareBefore(before);store().setPreviewDoc(before?doc:pendingResult.doc);}}>{compareBefore?'查看修改后':'查看修改前'}</button>{compareBefore&&<p className="mt-1 text-amber-200">当前显示修改前，请切回修改后再确认应用</p>}</div>}
      <div className="flex gap-2 mt-3"><button disabled={compareBefore} onClick={commit} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded py-2 text-sm">{pendingBatch.incomplete?'保留此阶段':'确认应用'}</button><button onClick={discard} className="px-3 bg-white/10 rounded text-sm">放弃预览</button></div>
    </div>}
    {(aiStatus==='error' || aiStatus==='cancelled') && <div className="px-3 pb-2 text-xs" role="status"><span className="text-amber-300">{aiStatus==='error'?'本次未完成，原场景未修改':'已停止生成'}</span>{lastRequest && <button onClick={restore} className="ml-3 text-blue-300 underline">恢复指令重试</button>}{aiError && <details className="mt-1 text-gray-400"><summary>错误详情</summary><p className="select-text break-words whitespace-pre-wrap">{aiError}</p></details>}</div>}
    {notice && <div role="status" className="px-3 py-2 text-xs text-amber-200">{notice}</div>}
    {busy && agentActivity && (agentActivity.inputTokens+agentActivity.outputTokens>=100000 || elapsed>=300) && <p role="status" className="px-3 pb-2 text-xs text-amber-300">任务仍在继续，累计 {agentActivity.inputTokens+agentActivity.outputTokens} Token，已运行 {Math.floor(elapsed/60)} 分钟。可随时停止并保留已生成草稿。</p>}
    {!!attachments.length && <div className="flex gap-2 p-2 flex-wrap">{attachments.map((src,i)=><div key={i} className="relative"><button onClick={()=>setImageView(src)}><img src={src} alt={`待发送参考图 ${i+1}`} className="w-16 h-14 rounded object-cover"/></button><button aria-label={`移除参考图 ${i+1}`} onClick={()=>setAttachments(prev=>prev.filter((_,j)=>i!==j))} className="absolute -top-1 -right-1 rounded-full bg-red-600 w-5 h-5 text-xs">×</button></div>)}</div>}
    {!busy && !previewing && aiConfig && !aiConfig.useMock && aiConfig.agentMode !== 'single' && <p className="px-3 pb-2 text-[11px] text-gray-400">Pi 连续建模：有进展就继续，无响应或反复失败时暂停。场景截图会发给当前模型复核；长任务用量会增加，可随时停止。</p>}
    {doc.nodes.length>0&&<fieldset disabled={busy||previewing} className="edit-scope-controls mx-3 mb-2 space-y-1 text-xs text-gray-300 disabled:opacity-50">{selection.length>0?<label className="flex gap-2 items-center"><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/>仅修改选中对象（{selection.length} 个）</label>:<p>编辑范围：全场景；选中设备或零件可限定范围</p>}{selection.length>0&&onlySelected&&<label className="flex gap-2 items-center"><input type="checkbox" checked={allowAssemblyAdditions} onChange={e=>setAllowAssemblyAdditions(e.target.checked)}/>允许给完整选中的组件追加零件</label>}<label className="flex gap-2 items-center"><input type="checkbox" checked={lockPlacement} onChange={e=>setLockPlacement(e.target.checked)}/>锁定已有对象的位置与朝向</label></fieldset>}
    <div className="chat-composer p-3 border-t border-white/10 bg-[#252A31]">
      <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} aria-label="建模指令" rows={3}
        onPaste={e=>{const items=Array.from(e.clipboardData.items).filter(it=>it.type.startsWith('image/'));if(items.length){e.preventDefault();void addImages(items.map(it=>it.getAsFile()).filter((f): f is File=>!!f));}}}
        onCompositionStart={()=>composingRef.current=true} onCompositionEnd={()=>composingRef.current=false}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!composingRef.current&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy&&!previewing)void send();}}}
        placeholder={busy || previewing ? '可以先写下一条，当前任务结束后发送…' : '描述结构、尺寸与需要修改的细节…'}
        className="w-full bg-black/20 border border-white/15 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-400"/>
      <div className="flex items-center justify-between gap-2 mt-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{void addImages(Array.from(e.target.files??[]));e.target.value='';}}/>
        <button disabled={imageBusy||attachments.length>=MAX_IMAGES} onClick={()=>fileRef.current?.click()} className="text-xs text-gray-300 disabled:opacity-40">{imageBusy?'处理图片…':`＋ 参考图 ${attachments.length}/${MAX_IMAGES}`}</button>
        <span className="text-[10px] text-gray-500">Shift+Enter 换行</span>
        <button onClick={()=>void send()} disabled={busy||previewing||imageBusy||(!input.trim()&&!attachments.length)} className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm">{previewing?'先确认预览':busy?'等待当前任务':'发送'}</button>
      </div>
      {!attachments.length && messages.some(m=>m.images?.length) && <label className="flex items-center gap-2 text-[11px] text-gray-400 mt-2"><input type="checkbox" checked={reuseReference} onChange={e=>setReuseReference(e.target.checked)}/>沿用最近参考图（新建无关模型时可取消）</label>}
    </div>
    {imageView && <div role="dialog" aria-modal="true" aria-label="参考图预览" onKeyDown={e=>{if(e.key==='Tab')e.preventDefault();}} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-10" onClick={()=>setImageView(null)}><img src={imageView} alt="参考图大图" className="max-h-full max-w-full object-contain" onClick={e=>e.stopPropagation()}/><button autoFocus aria-label="关闭参考图" onClick={()=>setImageView(null)} className="absolute right-6 top-5 text-white text-2xl">×</button></div>}
  </div>;
}
