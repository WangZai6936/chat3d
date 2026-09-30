import { Geometry } from '../domain/types';
import { useDisplayDoc, useEditorStore } from '../store';

// 属性面板：精确尺寸、位置。空值/非法输入不能提交（方案第 8 节）
export function PropertiesPanel() {
  const doc = useDisplayDoc();
  const selection = useEditorStore((s) => s.selection);
  const applyCommandBatch = useEditorStore((s) => s.applyCommandBatch);

  const node = selection.length > 0 ? doc.nodes.find((n) => n.id === selection[0]) : undefined;

  if (!node) {
    return (
      <div className="flex flex-col h-full bg-[#252A31] text-gray-200">
        <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-black/30 tracking-wider">属性</div>
        <div className="px-3 py-6 text-xs text-gray-500 text-center">未选中对象</div>
      </div>
    );
  }

  const isPrimitive = node.kind === 'primitive' && node.geometry;
  const g = node.geometry;
  // 几何参数与实际包围尺寸并示（方案第 8 节：避免「宽 1m、缩放 2 倍」造成误解）
  const bbox = g ? geomBbox(g) : null;
  const effectiveW = bbox ? bbox[0] * node.transform.scale[0] : 0;
  const effectiveH = bbox ? bbox[1] * node.transform.scale[1] : 0;
  const effectiveD = bbox ? bbox[2] * node.transform.scale[2] : 0;

  const commit = (op: 'rename' | 'translate', payload: Record<string, unknown>) => {
    const r = applyCommandBatch([{ op, targetId: node.id, ...payload } as never], `修改 ${node.name}`);
    if (!r.ok && r.error) window.alert(r.error); // 如：预览待确认期间编辑被拒绝
  };

  return (
    <div className="flex flex-col h-full bg-[#252A31] text-gray-200">
      <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-black/30 tracking-wider">属性</div>
      <div className="flex-1 overflow-auto p-3 space-y-4 text-sm">
        {/* 名称 */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">名称</label>
          <input
            type="text"
            defaultValue={node.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== node.name) commit('rename', { name: v });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* 位置（世界，米）*/}
        <div>
          <label className="block text-xs text-gray-400 mb-1">位置 X / Y / Z（米）</label>
          <div className="grid grid-cols-3 gap-1">
            {node.transform.position.map((v, i) => (
              <input
                key={i}
                type="number"
                step="0.05"
                defaultValue={v.toFixed(3)}
                onBlur={(e) => {
                  const nv = parseFloat(e.target.value);
                  if (!Number.isFinite(nv)) return; // 非法输入不提交
                  const pos = [...node.transform.position] as [number, number, number];
                  pos[i] = nv;
                  commit('translate', { space: 'world', mode: 'set', value: pos });
                }}
                className="bg-black/30 border border-white/10 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-blue-400"
              />
            ))}
          </div>
        </div>

        {/* 几何参数 */}
        {isPrimitive && g && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">几何参数（{g.type}）</label>
            <div className="space-y-1">
              {Object.entries(g.params).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-28">{k}</span>
                  <span className="text-sm">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 实际包围尺寸 */}
        {bbox && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">实际包围尺寸（含缩放，米）</label>
            <div className="text-sm space-y-1">
              <div>宽 X：{effectiveW.toFixed(3)}</div>
              <div>高 Y：{effectiveH.toFixed(3)}</div>
              <div>深 Z：{effectiveD.toFixed(3)}</div>
            </div>
          </div>
        )}

        {/* 材质 */}
        {node.materialId && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">材质</label>
            <div className="flex gap-1">
              {doc.materials.map((m) => (
                <button
                  key={m.id}
                  title={m.baseColor}
                  onClick={() => {
                    const r = applyCommandBatch([{ op: 'setMaterial', targetId: node.id, materialId: m.id }], `应用材质 ${m.id}`);
                    if (!r.ok && r.error) window.alert(r.error);
                  }}
                  className={`w-7 h-7 rounded border-2 ${node.materialId === m.id ? 'border-blue-400' : 'border-transparent'}`}
                  style={{ backgroundColor: m.baseColor }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 各几何类型的局部包围盒（米）
function geomBbox(g: Geometry): [number, number, number] {
  switch (g.type) {
    case 'box':
      return [g.params.width, g.params.height, g.params.depth];
    case 'sphere':
      return [g.params.radius * 2, g.params.radius * 2, g.params.radius * 2];
    case 'cone':
      return [g.params.radius * 2, g.params.height, g.params.radius * 2];
    case 'plane':
      return [g.params.width, 0, g.params.depth];
    case 'cylinder': {
      const r = Math.max(g.params.radiusTop, g.params.radiusBottom);
      return [r * 2, g.params.height, r * 2];
    }
    default:
      return [0, 0, 0];
  }
}
