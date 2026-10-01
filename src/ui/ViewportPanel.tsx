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
  const [backdrop,setBackdrop]=useState<'light'|'slate'>('slate');
  const viewportRef = useRef<Viewport | null>(null);
  const doc = useDisplayDoc(); // 预览期间自动切到预演副本，确认/放弃后回到真实文档
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);

  useEffect(() => {
    if (!hostRef.current) return;
    let vp: Viewport;
    try { vp = new Viewport(hostRef.current, (nodeId) => {
      // 视口拾取：点中选中，点空白取消
      select(nodeId ? [nodeId] : null);
    });
    } catch(e) {setViewportError(e instanceof Error?e.message:'无法创建 WebGL 视图');return;}
    setViewportError('');
    viewportRef.current = vp;
    vp.start();
    const unregister = registerSceneCapture(async (document, view, targetIds) => vp.captureDocument(document, view, targetIds));
    return () => {
      unregister();
      vp.dispose();
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(()=>{viewportRef.current?.setGridVisible(gridVisible);},[gridVisible,attempt]);
  useEffect(()=>{viewportRef.current?.setBackdrop(backdrop);},[backdrop,attempt]);
  // 文档变化 → 同步到视口
  useEffect(() => {
    viewportRef.current?.sync(doc);
  }, [doc,attempt]);

  // 选择变化 → 高亮
  useEffect(() => {
    viewportRef.current?.setSelection(new Set(selection));
  }, [selection, doc,attempt]);

  return (
    <div className="relative flex-1 bg-[#202428] min-w-0">
      {!!selection.length&&<div className="absolute bottom-3 left-3 z-10 flex gap-2"><button className="rounded bg-black/60 px-3 py-2 text-sm text-gray-200" onClick={()=>viewportRef.current?.fitToSelection(selection)}>聚焦选中</button>{doc.nodes.find(n=>n.id===selection[0])?.assemblyId&&<button className="rounded bg-black/60 px-3 py-2 text-sm text-gray-200" onClick={()=>{const id=doc.nodes.find(n=>n.id===selection[0])?.assemblyId;select(doc.nodes.filter(n=>n.assemblyId===id).map(n=>n.id));}}>选择整台设备</button>}</div>}
      <div className="absolute top-11 left-3 z-10 flex gap-2"><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={()=>viewportRef.current?.presentationView()}>沙盘视角</button><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={()=>viewportRef.current?.topView()}>俯视布局</button><button aria-pressed={gridVisible} className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={()=>{setGridVisible(!gridVisible);viewportRef.current?.setGridVisible(!gridVisible);}}>网格</button><button className="rounded bg-white/90 border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={()=>setBackdrop(backdrop==='slate'?'light':'slate')}>{backdrop==='slate'?'切换浅色背景':'切换深色背景'}</button></div>
      <button onClick={() => viewportRef.current?.fitToScene()} className="absolute bottom-3 right-3 z-10 rounded bg-black/60 px-3 py-2 text-sm text-gray-200 hover:bg-black/80">适应场景</button>
      {viewportError&&<div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#18212c] p-6 text-center text-sm text-gray-300"><strong>无法启动三维视图</strong><p>请检查浏览器 WebGL 与硬件加速设置，其他会话管理功能仍可使用。</p><button onClick={()=>setAttempt(v=>v+1)} className="rounded bg-blue-700 px-4 py-2">重试视图</button><details className="text-xs text-gray-500"><summary>技术详情</summary>{viewportError}</details></div>}
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-2 left-2 text-xs text-gray-400 bg-black/40 px-2 py-1 rounded">
        左键：拖拽旋转 / 点击拾取 · 右键：平移 · 滚轮：缩放 · 单位：米 · Y 轴向上
      </div>
    </div>
  );
}
