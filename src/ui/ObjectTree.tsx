import { useDisplayDoc, useEditorStore } from '../store';

// 对象树：分组、名称、可见性。选择与视口联动
export function ObjectTree() {
  const doc = useDisplayDoc();
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const applyCommandBatch = useEditorStore((s) => s.applyCommandBatch);

  const sorted = [...doc.nodes].sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  return (
    <div className="flex flex-col h-full bg-[#252A31] text-gray-200 select-none">
      <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-black/30 tracking-wider">
        对象树 · {doc.nodes.length}
      </div>
      <div className="flex-1 overflow-auto py-1">
        {sorted.length === 0 ? (
          <div className="px-3 py-6 text-xs text-gray-500 text-center">
            空场景
            <br />
            在对话区输入「创建一个工作台」开始
          </div>
        ) : (
          sorted.map((n) => {
            const selected = selection.includes(n.id);
            return (
              <div
                key={n.id}
                onClick={() => select([n.id])}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm ${
                  selected ? 'bg-blue-600/30 border-l-2 border-blue-400' : 'hover:bg-white/5 border-l-2 border-transparent'
                }`}
              >
                <span className="flex-1 truncate">{n.name}</span>
                <button
                  title={n.visible ? '隐藏' : '显示'}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = applyCommandBatch(
                      [{ op: 'setVisibility', targetId: n.id, visible: !n.visible }],
                      `${n.visible ? '隐藏' : '显示'} ${n.name}`,
                    );
                    if (!r.ok && r.error) window.alert(r.error); // 如：预览待确认期间编辑被拒绝
                  }}
                  className="text-xs text-gray-400 hover:text-white px-1"
                >
                  {n.visible ? '👁' : '—'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
