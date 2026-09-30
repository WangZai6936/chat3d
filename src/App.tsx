// 应用外壳（方案第 2 节四区布局）：顶部工具栏 + 左对象树/属性 + 中视口 + 右对话
// React 只画壳子与列表类 UI；Three.js 视口保持命令式（决策 #1）
// 对话区放右侧整高：消息上下文完整可见（早期版本放底部，只能看到一两行）
import { ChatPanel } from './ui/ChatPanel';
import { ObjectTree } from './ui/ObjectTree';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { ViewportPanel } from './ui/ViewportPanel';
import { useEditorStore, useDisplayDoc } from './store';

export default function App() {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const dirty = useEditorStore((s) => s.dirty);
  const nodeCount = useDisplayDoc().nodes.length;
  const previewing = useEditorStore((s) => s.aiStatus === 'previewing');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1b1e23] text-gray-100 overflow-hidden">
      {/* 顶部工具栏 */}
      <header className="flex items-center gap-1 px-3 h-11 bg-[#252A31] border-b border-black/40 select-none shrink-0">
        <div className="font-bold tracking-wide mr-3">
          chat3d <span className="text-xs font-normal text-gray-400 ml-1">对话式三维建模</span>
        </div>

        {/* 项目管理/导出：P1 实现，此处占位禁用 */}
        <ToolButton label="新建" disabled title="P1：项目管理" />
        <ToolButton label="打开" disabled title="P1：项目管理" />
        <ToolButton label="保存" disabled title="P1：项目管理" />
        <ToolButton label="导出 GLB" disabled title="P1：导出" />

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton label="↺ 撤销" onClick={undo} disabled={!canUndo || previewing} title="撤销上一条事务" />
        <ToolButton label="↻ 重做" onClick={redo} disabled={!canRedo || previewing} title="重做" />

        <div className="flex-1" />

        {/* 状态角标 */}
        {previewing && (
          <span className="text-xs text-emerald-400 mr-2">预览待确认</span>
        )}
        <span className="text-xs text-gray-500">
          {dirty ? '未保存 · ' : ''}
          {nodeCount} 个对象
        </span>
      </header>

      {/* 主区：左 对象树/属性 · 中 视口 · 右 对话 */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-72 shrink-0 border-r border-black/40 flex flex-col">
          <div className="flex-1 min-h-0">
            <ObjectTree />
          </div>
          <div className="h-80 shrink-0 border-t border-black/40 overflow-auto">
            <PropertiesPanel />
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex">
          <ViewportPanel />
        </main>
        <aside className="w-[420px] shrink-0 border-l border-black/40">
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}

interface ToolButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

function ToolButton({ label, onClick, disabled, title }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2.5 py-1 text-sm rounded text-gray-200 hover:bg-white/10 disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
