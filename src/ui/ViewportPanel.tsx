import { useEffect, useRef } from 'react';
import { Viewport } from '../scene/Viewport';
import { useDisplayDoc, useEditorStore } from '../store';
// Three.js 视口宿主：React 只负责挂载/销毁，渲染逻辑全在 Viewport 类里（命令式）
// 通过 Zustand store 双向通信：doc 变化 → sync；视口拾取 → store.select
export function ViewportPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const doc = useDisplayDoc(); // 预览期间自动切到预演副本，确认/放弃后回到真实文档
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);

  useEffect(() => {
    if (!hostRef.current) return;
    const vp = new Viewport(hostRef.current, (nodeId) => {
      // 视口拾取：点中选中，点空白取消
      select(nodeId ? [nodeId] : null);
    });
    viewportRef.current = vp;
    vp.start();
    return () => {
      vp.dispose();
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 文档变化 → 同步到视口
  useEffect(() => {
    viewportRef.current?.sync(doc);
  }, [doc]);

  // 选择变化 → 高亮
  useEffect(() => {
    viewportRef.current?.setSelection(new Set(selection));
  }, [selection]);

  return (
    <div className="relative flex-1 bg-[#202428] min-w-0">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-2 left-2 text-xs text-gray-400 bg-black/40 px-2 py-1 rounded">
        左键：拖拽旋转 / 点击拾取 · 右键：平移 · 滚轮：缩放 · 单位：米 · Y 轴向上
      </div>
    </div>
  );
}
