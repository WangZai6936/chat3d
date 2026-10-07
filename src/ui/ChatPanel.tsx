import {Button,TextArea,DropdownMenu} from '@radix-ui/themes';
import {PlusIcon,ArrowUpIcon,ImageIcon,PersonIcon,ChatBubbleIcon,DotsHorizontalIcon,Pencil1Icon,TrashIcon} from '@radix-ui/react-icons';
import {SiteAccessRecovery} from './SiteAccessRecovery';
import {ConversationRun} from './ConversationRun';
import {MessageText} from './MessageText';
import {ResultMessage} from './ResultMessage';
import {ModelPicker} from './ModelPicker';
import {QualityPicker} from './QualityPicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {sceneChanges} from '../domain/editScope';
import {useStore} from 'zustand';
import { useEditorStore } from '../store';
import {activeConversationStore} from '../conversationStores';
import {conversationController} from '../runtime/conversationController';
export {REQUEST_TIMEOUT_MS} from '../runtime/conversationController';

const MAX_IMAGES = 4;
export async function compressImage(file: File | Blob): Promise<string> {
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

export function ChatPanel({onConfigure,onAssets,canvasMode=false,expanded=true,onExpand,autoStartRequest,onAutoStartConsumed}:{autoStartRequest?:{id:string;projectId:string}|null;onAutoStartConsumed?:(id:string)=>void;executionDetails?:boolean;onConfigure?:()=>void;onAssets?:()=>void;canvasMode?:boolean;expanded?:boolean;onExpand?:()=>void}={}) {
  const { messages, aiStatus, aiError, pendingBatch, pendingResult, aiConfig, selection, doc } = useEditorStore();
  const editor=activeConversationStore();
  const store = editor.getState;
  const runtime=conversationController(editor);
  const {notice,agentActivity,canSteer,runPi,started,lastRequest,removedQueueId,runMessageId:currentRunId}=useStore(runtime.ui);
  const runMessageId={current:currentRunId};
  const setNotice=runtime.setNotice;
  const input=useEditorStore(s=>s.composerText);
  const setInput=(text:string)=>store().setComposerText(text);
  const attachments=useEditorStore(s=>s.composerImages);
  const setAttachments=(value:string[]|((previous:string[])=>string[]))=>store().setComposerImages(typeof value==='function'?value(store().composerImages):value);
  const [lockPlacement,setLockPlacement]=useState(false);
  const [scopeMode,setScopeMode]=useState<'scene'|'selection'>('scene');
  useEffect(()=>{setScopeMode('scene');setLockPlacement(false);},[doc.projectId]);
  const [compareBefore,setCompareBefore]=useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [largeComposer,setLargeComposer]=useState(false);
  const [now, setNow] = useState(Date.now());
  const [reuseReference, setReuseReference] = useState(true);
  const [imageView, setImageView] = useState<string | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const composingRef = useRef(false);
  const imageBusyRef = useRef(false);
  const aliveRef = useRef(true);
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
    aliveRef.current=true;
    return()=>{aliveRef.current=false;const state=store();if(state.aiStatus==='previewing'&&state.pendingResult)state.setPreviewDoc(state.pendingResult.doc);};
  },[editor]);
  useEffect(()=>{if(busy)setCompareBefore(false);},[busy]);
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
  const send=async(mode:'guide'|'question'|'later'='guide')=>{
    if(imageBusyRef.current)return;
    stickRef.current=true;await runtime.send(mode,{scopeMode,lockPlacement,reuseReference});
    if(aliveRef.current)inputRef.current?.focus();
  };
  const cancel=()=>{runtime.cancel();inputRef.current?.focus();};
  const autoStarted=useRef<string|null>(null);
  useEffect(()=>{
    if(!autoStartRequest||autoStartRequest.projectId!==doc.projectId||autoStarted.current===autoStartRequest.id)return;
    // Deferred past StrictMode's setup/cleanup replay. The request is transient and consumed before sending.
    const timer=setTimeout(()=>{if(!aliveRef.current||autoStarted.current===autoStartRequest.id)return;autoStarted.current=autoStartRequest.id;onAutoStartConsumed?.(autoStartRequest.id);void send();},0);
    return()=>clearTimeout(timer);
  },[autoStartRequest?.id,doc.projectId]);

  const pendingMessages=messages.filter(m=>m.queuedTask?.status==='waiting');
  const prepareQueued=(id:string)=>{const m=store().messages.find(m=>m.id===id&&m.queuedTask?.status==='waiting');if(!m)return;if(store().composerText.trim()||store().composerImages.length){setNotice('请先处理输入框中的内容');return;}setInput(m.text);setAttachments(m.images??[]);editor.setState(state=>({messages:state.messages.map(item=>item.id===id?{...item,queuedTask:{status:'prepared' as const}}:item)}));inputRef.current?.focus();};
  const promoteQueued=runtime.promoteQueued;
  const {removeQueued,restoreQueued}=runtime;

  const restore = () => {
    if(!lastRequest) return;
    if(input.trim() || attachments.length) { setNotice('请先处理当前草稿，再恢复上一条指令'); return; }
    setInput(lastRequest.text); setAttachments(lastRequest.images); setNotice('已恢复，请按需修改后发送'); inputRef.current?.focus();
  };

  const commit = () => {runtime.commit();inputRef.current?.focus();};
  const discard = () => {runtime.discard();inputRef.current?.focus();};
  const previewCard=(previewing && pendingBatch && <div className="preview-decision mx-3 mb-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5" role="region" aria-label="预览确认">
      <div className="text-emerald-300 text-sm font-medium">{pendingBatch.taskStatus==='partial'?'本次任务中断 · 已保留部分修改':'本次修改已生成 · 等待应用'} · {pendingBatch.operations.length} 项操作</div>
      <p className="text-xs text-gray-300 mt-1">应用后写入当前项目，可撤销；继续调整会在当前预览上修改。</p>
      <div className="flex gap-2 mt-3"><button disabled={compareBefore} onClick={commit} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded py-2 text-sm">应用修改</button><button onClick={discard} className="px-3 bg-white/10 rounded text-sm">放弃修改</button></div>
      {(pendingBatch.incomplete||viewportStatus!=='ready')&&<details className="mt-2 text-xs text-amber-200"><summary>模型质量：尚有待核对项（不等于本次修改失败）</summary><p className="mt-2">{viewportStatus!=='ready'?'实时三维画面不可用，尚不能完成真实材质与交互验收。':''}应用修改不会将模型质量标为通过。</p>{!!pendingBatch.qualityIssues?.length&&<ul className="mt-2 space-y-1">{[...new Set(pendingBatch.qualityIssues)].map((issue,i)=><li key={i}>{issue}</li>)}</ul>}</details>}

      {pendingResult&&<details className="preview-change-details mt-2 text-xs text-gray-300"><summary>修改对比与受影响对象</summary><p>修改对比：新增 {changes.filter(c=>c.kind==='added').length} · 修改 {changes.filter(c=>c.kind==='modified').length} · 移除 {changes.filter(c=>c.kind==='removed').length}</p><details className="mt-2"><summary className="cursor-pointer">查看受影响对象</summary><ul className="max-h-40 overflow-auto mt-1 space-y-1">{changes.map(c=><li key={c.id}><button className="text-left hover:text-blue-200 disabled:opacity-50" disabled={!pendingResult.doc.nodes.some(n=>n.id===c.id)} onClick={()=>store().select([c.id])}>{c.group} / {c.name}：{c.fields.join('、')}</button></li>)}</ul></details><button className="mt-2 rounded bg-white/10 px-2 py-1" onClick={()=>{const before=!compareBefore;setCompareBefore(before);store().setPreviewDoc(before?doc:pendingResult.doc);}}>{compareBefore?'查看修改后':'查看修改前'}</button>{compareBefore&&<p className="mt-1 text-amber-200">当前显示修改前，请切回修改后再确认应用</p>}</details>}
      <button className="mt-3 text-xs text-blue-300" onClick={()=>{if(!input.trim()&&pendingBatch.continuation)setInput(pendingBatch.continuation);inputRef.current?.focus();}}>继续调整</button>
      
    </div>);
  return <div className={`chat-panel flex flex-col h-full min-w-0 bg-[#20242b] text-gray-200 ${canvasMode?'canvas-chat':''} ${!expanded?'is-compact':''}`}>
    <div className="chat-context-strip" title="会话在本浏览器保存；请下载项目文件长期备份"><span>{selection.length ? `已选 ${selection.length} 个对象` : `场景 ${doc.nodes.length} 个对象`}</span></div>
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
      {messages.filter(m=>!m.queuedTask).map(m=><div key={m.id}><div className={`chat-message-row ${m.role==='user'?'is-user':'is-assistant'} flex ${m.role==='user'?'justify-end':'justify-start'}`}>
        {canvasMode&&<span className={`chat-avatar ${m.role}`} aria-hidden="true">{m.role==='user'?<PersonIcon/>:<ChatBubbleIcon/>}</span>}
        <div className={`chat-message ${m.role==='user'?'chat-message-user':'chat-message-assistant'} max-w-[94%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${m.role==='user'?'bg-blue-600 text-white':m.error?'bg-red-950/50 border border-red-500/30 text-red-200':'bg-[#2c323b]'}`}>
          <div className="text-[10px] opacity-60 mb-1">{m.role==='user'?'你':'chat3d'} · {new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          {!!m.images?.length && <div className="flex flex-wrap gap-2 mb-2">{m.images.map((src,i)=><button key={i} onClick={()=>setImageView(src)} title="放大参考图"><img src={src} alt={`参考图 ${i+1}`} className="w-20 h-16 rounded object-cover"/></button>)}</div>}
          {m.role==='assistant'&&m.batch?<ResultMessage text={m.text}/>:<MessageText text={m.text}/>}
          {m.queuedTask&&<div className="mt-2 text-xs">{m.queuedTask.status==='waiting'?'后续任务 · 尚未执行':'后续任务 · 已放入输入框，尚未发送'}<button disabled={busy} className="ml-2 underline disabled:opacity-40" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容');return;}setInput(m.text);setAttachments(m.images??[]);editor.setState(state=>({messages:state.messages.map(item=>item.id===m.id?{...item,queuedTask:{status:'prepared' as const}}:item)}));inputRef.current?.focus();}}>准备发送</button></div>}
          {m.steering&&<div className="mt-1 text-xs opacity-75">{m.steering.status==='queued'?'补充要求 · 等待接收':m.steering.status==='received'?'补充要求 · 已送入模型上下文':'补充要求 · 未送达，可重新发送'}{m.steering.status==='interrupted'&&<button className="ml-2 underline" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容，再恢复补充要求');return;}setInput(m.text);setAttachments(m.images??[]);inputRef.current?.focus();}}>恢复补充要求</button>}</div>}
          {m.batch && <div className="mt-2 text-xs text-emerald-300">{m.outcome==='applied'?'✓ 已应用 · 可用工具栏撤销':m.outcome==='discarded'?'已放弃 · 未修改场景':m.outcome==='superseded'?'已合并到后续预览':pendingBatch?.requestId===m.batch.requestId?'待确认 · 当前画面是预览':'预览已结束'}</div>}
        </div>
      </div>
      {m.run&&['failed','stopped'].includes(m.run.status)&&!busy&&<button className="mt-1 text-xs text-blue-300 underline" onClick={()=>{if(input.trim()||attachments.length){setNotice('请先处理输入框中的内容');return;}setInput(m.text);setAttachments(m.images??[]);inputRef.current?.focus();}}>恢复本轮指令</button>}
      {m.run&&<ConversationRun run={m.run} activity={busy&&m.id===runMessageId.current?agentActivity:undefined} onStop={busy&&m.id===runMessageId.current?cancel:undefined}/>}
      {!canvasMode&&previewing&&m.batch?.requestId===pendingBatch?.requestId&&previewCard}
      </div>)}
    {(aiStatus==='error' || aiStatus==='cancelled') && <div className="px-3 pb-2 text-xs" role="status"><span className="text-amber-300">{aiStatus==='error'?'本次未完成，原场景未修改':'已停止生成'}</span>{lastRequest && <button onClick={restore} className="ml-3 text-blue-300 underline">恢复指令重试</button>}{aiError && <details className="mt-1 text-gray-400"><summary>错误详情</summary><p className="select-text break-words whitespace-pre-wrap">{aiError}</p></details>}</div>}
      {!canvasMode&&previewing&&!messages.some(m=>m.batch?.requestId===pendingBatch?.requestId)&&previewCard}
    </div>
    {canvasMode&&expanded&&previewCard}
    <SiteAccessRecovery error={aiError}/>
    {newMessages && <button className="text-xs text-blue-300 py-1" onClick={()=>{stickRef.current=true;setNewMessages(false);if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;}}>查看最新消息 ↓</button>}
    {notice && <div role="status" className="px-3 py-2 text-xs text-amber-200">{notice}</div>}
    {busy && agentActivity && (agentActivity.inputTokens+agentActivity.outputTokens>=100000 || elapsed>=300) && <p role="status" className="px-3 pb-2 text-xs text-amber-300">任务耗时较长，详情见任务记录。可随时停止并保留已生成草稿。</p>}
    {!!attachments.length && <div className="flex gap-2 p-2 flex-wrap">{attachments.map((src,i)=><div key={i} className="relative"><button onClick={()=>setImageView(src)}><img src={src} alt={`待发送参考图 ${i+1}`} className="w-16 h-14 rounded object-cover"/></button><button aria-label={`移除参考图 ${i+1}`} onClick={()=>setAttachments(prev=>prev.filter((_,j)=>i!==j))} className="absolute -top-1 -right-1 rounded-full bg-red-600 w-5 h-5 text-xs">×</button></div>)}</div>}
    {doc.nodes.length>0&&<details className="scope-disclosure" open={!canvasMode}><summary hidden={!canvasMode}>修改范围：{scopeMode==='selection'?'仅选中对象':'全场景'}</summary><fieldset disabled={busy} className="edit-scope-controls mx-3 mb-2 space-y-2 text-xs text-gray-200 disabled:opacity-50"><label className="flex items-center justify-between gap-2">修改范围<select aria-label="对话修改范围" value={scopeMode} onChange={e=>setScopeMode(e.target.value as 'scene'|'selection')} className="rounded bg-[#252A31] border border-white/20 px-2 py-1"><option value="scene">全场景</option><option value="selection">仅选中对象（{selection.length}）</option></select></label><p>{scopeMode==='selection'?(selection.length?`仅允许修改选中的 ${selection.length} 个零件；其他对象受保护。`:'请先在对象列表中选择对象，再发送指令。'):'可以修改全场景；选中对象仅用于指代，仍遵守指令中的局部限制。'}</p><details><summary>更多修改选项</summary><label className="flex gap-2 items-center mt-2"><input type="checkbox" checked={lockPlacement} onChange={e=>setLockPlacement(e.target.checked)}/>锁定已有对象的位置与朝向</label></details></fieldset></details>}
    {canvasMode&&!expanded&&previewing&&<div className="canvas-preview-strip"><span>修改结果待确认</span><button onClick={onExpand}>查看详情</button><button disabled={compareBefore} onClick={commit}>应用修改</button><button onClick={discard}>放弃修改</button></div>}
    {canvasMode&&!expanded&&busy&&<div className="canvas-preview-strip"><span>正在处理 · {{idle:'就绪',capturing:'检查画面',context:'准备上下文',generating:'生成中',validating:'校验修改',applying:'应用修改',previewing:'待确认',error:'失败',cancelled:'已停止'}[aiStatus]}</span><button onClick={onExpand}>查看过程</button><button onClick={cancel}>停止生成</button></div>}
    <div className={`chat-composer p-3 border-t border-white/10 bg-[#252A31] ${largeComposer?'is-large':''}`}>


      {!!pendingMessages.length&&<section className="composer-queue" aria-label="排队消息"><div className="composer-queue-count">{pendingMessages.length} 条待处理消息</div><div className="composer-queue-list">{pendingMessages.map(m=><div className="composer-queue-row" key={m.id}><span className="composer-queue-text" title={m.text}>{m.text}{m.images?.length?` · ${m.images.length}张图`:''}</span>{busy?<Button type="button" variant="ghost" color="gray" disabled={!canSteer} onClick={()=>promoteQueued(m.id,'guide')} title="将这条消息交给当前任务调整方向">引导</Button>:<Button type="button" variant="ghost" color="gray" onClick={()=>prepareQueued(m.id)}>准备发送</Button>}<DropdownMenu.Root><DropdownMenu.Trigger><Button type="button" variant="ghost" color="gray" className="queue-more" aria-label={`消息选项 ${m.text}`}><DotsHorizontalIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content className="composer-action-menu" side="top" align="end" color="gray">{busy&&<DropdownMenu.Item disabled={!canSteer} onSelect={()=>promoteQueued(m.id,'question')}>只提问，不修改模型</DropdownMenu.Item>}<DropdownMenu.Item onSelect={()=>prepareQueued(m.id)}><Pencil1Icon/>编辑消息</DropdownMenu.Item><DropdownMenu.Item onSelect={()=>removeQueued(m.id)}><TrashIcon/>移出队列</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root></div>)}</div></section>}
      {removedQueueId&&<div className="composer-queue-undo">已移出队列 <button type="button" onClick={restoreQueued}>撤销移除</button></div>}

      <div className="composer-input-shell">
      {canvasMode&&<button type="button" className="composer-expand" aria-label={largeComposer?'缩小输入框':'展开输入框'} aria-pressed={largeComposer} onClick={()=>setLargeComposer(!largeComposer)}>{largeComposer?'收起':'展开'}</button>}
      <TextArea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} aria-label="建模指令" rows={canvasMode?(largeComposer?8:4):3}
        onPaste={e=>{const items=Array.from(e.clipboardData.items).filter(it=>it.type.startsWith('image/'));if(items.length){e.preventDefault();void addImages(items.map(it=>it.getAsFile()).filter((f): f is File=>!!f));}}}
        onCompositionStart={()=>composingRef.current=true} onCompositionEnd={()=>composingRef.current=false}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!composingRef.current&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy||runPi)void send(busy&&runPi?'later':'guide');}}}
        placeholder={busy ? canSteer?'补充要求、纠正方向或提问，当前操作结束后接收…':'正在准备，可先输入补充要求…' : previewing?'继续描述调整要求，将修改当前预览…': '描述结构、尺寸与需要修改的细节…'}
        className="w-full bg-black/20 border border-white/15 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-400"/>
      </div>
      <div className="composer-toolbar">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{void addImages(Array.from(e.target.files??[]));e.target.value='';}}/>
        <DropdownMenu.Root><DropdownMenu.Trigger><Button type="button" variant="ghost" color="gray" aria-label="添加与参考图选项" title="添加参考图与图片选项" className="composer-icon"><PlusIcon/>{attachments.length>0&&<span className="attachment-count">{attachments.length}</span>}</Button></DropdownMenu.Trigger><DropdownMenu.Content className="composer-action-menu" align="start" side="top" color="gray"><DropdownMenu.Item disabled={imageBusy||attachments.length>=MAX_IMAGES} onSelect={()=>fileRef.current?.click()}><ImageIcon/>{imageBusy?'正在处理参考图':'添加参考图'}</DropdownMenu.Item>{!attachments.length&&messages.some(m=>m.images?.length)&&<><DropdownMenu.Separator/><DropdownMenu.CheckboxItem checked={reuseReference} onCheckedChange={setReuseReference}>沿用最近参考图</DropdownMenu.CheckboxItem></>}<DropdownMenu.Label>最多4张 · 每张20MB以内</DropdownMenu.Label></DropdownMenu.Content></DropdownMenu.Root>
        <QualityPicker onConfigure={onConfigure}/><div className="composer-spacer"/><ModelPicker onConfigure={onConfigure}/>
        <Button variant="solid" onClick={()=>void send(busy&&runPi?'later':'guide')} disabled={(busy&&!runPi)||imageBusy||(!input.trim()&&!attachments.length)} className="composer-send" aria-label={busy&&runPi?'加入消息队列':busy?'等待当前请求':'发送'} title={busy&&runPi?'先放入上方消息条，再选择引导或稍后发送':busy?'等待当前请求':'发送（Enter发送，Shift+Enter换行）'}><ArrowUpIcon/></Button>

      </div>

    </div>
    {imageView && <div role="dialog" aria-modal="true" aria-label="参考图预览" onKeyDown={e=>{if(e.key==='Tab')e.preventDefault();}} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-10" onClick={()=>setImageView(null)}><img src={imageView} alt="参考图大图" className="max-h-full max-w-full object-contain" onClick={e=>e.stopPropagation()}/><button autoFocus aria-label="关闭参考图" onClick={()=>setImageView(null)} className="absolute right-6 top-5 text-white text-2xl">×</button></div>}
  </div>;
}
