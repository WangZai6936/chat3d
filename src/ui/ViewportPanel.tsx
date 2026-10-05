import {useAppearance} from './Appearance';
import {SoftwareGeometryView} from './SoftwareGeometryView';
import {registerSceneFocus} from '../scene/focus';
import type {PlaybackState} from '../scene/animationPlayback';
import { useEffect, useRef, useState } from 'react';
import { registerSceneCapture } from '../scene/capture';
import { Viewport } from '../scene/Viewport';
import { useDisplayDoc, useEditorStore } from '../store';
// Three.js 视口宿主：React 只负责挂载/销毁，渲染逻辑全在 Viewport 类里（命令式）
// 通过 Zustand store 双向通信：doc 变化 → sync；视口拾取 → store.select
export function ViewportPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewportError,setViewportError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [gridVisible,setGridVisible]=useState(false);
  const {resolved}=useAppearance();
  const [backdropOverride,setBackdropOverride]=useState<'light'|'slate'|null>(null);
  const backdrop=backdropOverride??(resolved==='dark'?'slate':'light');
  useEffect(()=>setBackdropOverride(null),[resolved]);
  const [playback,setPlayback]=useState<PlaybackState>({playing:false,time:0,speed:1,duration:0,loop:false,error:''});
  const aiStatus=useEditorStore(s=>s.aiStatus);
  const viewportStatus=useEditorStore(s=>s.viewportStatus);
  const busy=['capturing','context','generating','validating','applying'].includes(aiStatus);
  const viewportRef = useRef<Viewport | null>(null);
  const doc = useDisplayDoc(); // 预览期间自动切到预演副本，确认/放弃后回到真实文档
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);

  useEffect(() => {
    if (!hostRef.current) return;
    useEditorStore.setState({viewportStatus:'starting'});
    let vp: Viewport | undefined;
    try { vp = new Viewport(hostRef.current, (nodeId) => {
      // 视口拾取：点中选中，点空白取消
      select(nodeId ? [nodeId] : null);
    });
    vp.setPlaybackListener(setPlayback);vp.sync(useEditorStore.getState().previewDoc??useEditorStore.getState().doc);vp.start();
    } catch(e) {vp?.dispose();useEditorStore.setState({viewportStatus:'error'});setViewportError(e instanceof Error?e.message:'无法创建 WebGL 视图');return;}
    setViewportError('');
    useEditorStore.setState({viewportStatus:'ready'});
    viewportRef.current = vp;

    const canvas=hostRef.current.querySelector('canvas');
    const lost=()=>{useEditorStore.setState({viewportStatus:'error'});setViewportError('WebGL 上下文已丢失，请重试视图');};
    canvas?.addEventListener('webglcontextlost',lost);
    const unregisterFocus=registerSceneFocus(ids=>vp!.fitToSelection(ids));
    const unregister = registerSceneCapture(async (document, view, targetIds,time) => {if(useEditorStore.getState().viewportStatus!=='ready')throw new Error('三维画面不可用，无法进行截图复核');return vp!.captureDocument(document, view, targetIds,time);});
    return () => {
      canvas?.removeEventListener('webglcontextlost',lost);
      unregister();unregisterFocus();
      useEditorStore.setState({viewportStatus:'starting'});
      vp!.setPlaybackListener(null);vp!.dispose();
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(()=>{viewportRef.current?.setGridVisible(gridVisible);},[gridVisible,attempt]);
  useEffect(()=>{viewportRef.current?.setBackdrop(backdrop);},[backdrop,attempt]);
  useEffect(()=>{if(busy)viewportRef.current?.resetAnimation();},[busy]);
  // 文档变化 → 同步到视口
  useEffect(() => {
    viewportRef.current?.sync(doc);
  }, [doc,attempt]);

  // 选择变化 → 高亮
  useEffect(() => {
    viewportRef.current?.setSelection(new Set(selection));
  }, [selection, doc,attempt]);

  return (
    <div style={{isolation:'isolate',zIndex:0}} className="viewport-host relative flex-1 bg-[#202428] min-w-0">
      {doc.animation&&<div className="animation-controls" aria-label="动画播放控制"><div className="animation-controls-row"><strong title={doc.animation.name}>{doc.animation.name}</strong><span>{aiStatus==='previewing'?'待确认动画':'场景动画'} · {doc.animation.tracks.length} 条轨道</span><button disabled={busy||viewportStatus!=='ready'||!!playback.error} onClick={()=>playback.playing?viewportRef.current?.pauseAnimation():viewportRef.current?.playAnimation()}>{playback.playing?'暂停':'播放动画'}</button><button disabled={busy||viewportStatus!=='ready'} onClick={()=>viewportRef.current?.resetAnimation()}>重置</button><select disabled={busy||viewportStatus!=='ready'} aria-label="动画速度" value={playback.speed} onChange={e=>viewportRef.current?.setAnimationSpeed(Number(e.target.value))}>{[.25,.5,1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></div><div className="animation-controls-row"><input aria-label="动画时间" type="range" min={0} max={doc.animation.duration} step={.01} value={playback.time} disabled={busy||viewportStatus!=='ready'} onChange={e=>viewportRef.current?.seekAnimation(Number(e.target.value))}/><span>{playback.time.toFixed(1)} / {doc.animation.duration.toFixed(1)} s{doc.animation.loop?' · 循环':''}</span></div>{viewportStatus!=='ready'&&<p role="status">三维未就绪，暂不能播放；动画配置仍已保留。</p>}{playback.error&&<p role="alert">{playback.error}，请重置后修改动画配置</p>}</div>}
      {!!selection.length&&<div className="absolute bottom-3 left-3 z-10 flex gap-2"><button className="rounded bg-black/60 px-3 py-2 text-sm text-gray-200" disabled={viewportStatus!=='ready'} onClick={()=>viewportRef.current?.fitToSelection(selection)}>聚焦选中</button>{doc.nodes.find(n=>n.id===selection[0])?.assemblyId&&<button className="rounded bg-black/60 px-3 py-2 text-sm text-gray-200" onClick={()=>{const id=doc.nodes.find(n=>n.id===selection[0])?.assemblyId;select(doc.nodes.filter(n=>n.assemblyId===id).map(n=>n.id));}}>选择整台设备</button>}</div>}
      <div className="viewport-tools absolute top-11 left-3 z-10 flex gap-2"><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" disabled={viewportStatus!=='ready'} onClick={()=>viewportRef.current?.presentationView()}>沙盘视角</button><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" disabled={viewportStatus!=='ready'} onClick={()=>viewportRef.current?.topView()}>俯视布局</button><button disabled={viewportStatus!=='ready'} aria-pressed={gridVisible} className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={()=>{setGridVisible(!gridVisible);viewportRef.current?.setGridVisible(!gridVisible);}}>网格</button><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" disabled={viewportStatus!=='ready'} onClick={()=>setBackdropOverride(backdrop==='slate'?'light':'slate')}>{backdrop==='slate'?'切换浅色背景':'切换深色背景'}</button></div>
      <button disabled={viewportStatus!=='ready'} onClick={() => viewportRef.current?.fitToScene()} className="absolute bottom-3 right-3 z-10 rounded bg-black/60 px-3 py-2 text-sm text-gray-200 hover:bg-black/80">适应场景</button>
      {viewportError&&<div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#18212c] p-6 text-center text-sm text-gray-300"><strong>无法启动三维视图</strong><p>三维画面不可用，尚未完成视觉验收。仍可使用对象与属性、会话管理和项目导出。</p><button onClick={()=>setAttempt(v=>v+1)} className="rounded bg-blue-700 px-4 py-2">重试视图</button><SoftwareGeometryView doc={doc} selection={selection}/><details className="text-xs text-gray-500"><summary>技术详情</summary>{viewportError}</details></div>}
      <div ref={hostRef} className="absolute inset-0" />
      <div className="viewport-help pointer-events-none absolute top-2 left-2 text-xs text-gray-400 bg-black/40 px-2 py-1 rounded">
        {viewportStatus==='ready'?'左键：拖拽旋转 / 点击拾取 · 右键：平移 · 滚轮：缩放 · 单位：米 · Y 轴向上':'三维未就绪 · 使用对象与属性选择零件，再生成近景检查图'}
      </div>
    </div>
  );
}
