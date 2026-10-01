import {useState} from 'react';
import { Geometry, type SceneDocument, type SceneNode } from '../domain/types';
import type {AppearancePatch, Command} from '../domain/commands';
import { useDisplayDoc, useEditorStore } from '../store';

// 属性面板：精确尺寸、位置。空值/非法输入不能提交（方案第 8 节）
export function PropertiesPanel() {
  const doc = useDisplayDoc();
  const selection = useEditorStore((s) => s.selection);
  const applyCommandBatch = useEditorStore((s) => s.applyCommandBatch);
  const status=useEditorStore(s=>s.aiStatus);
  const locked=['capturing','context','generating','validating','applying','previewing'].includes(status);
  const lockNotice=locked?<p role="status" className="m-3 rounded border border-amber-400/30 p-2 text-xs text-amber-200">{status==='previewing'?'当前是待确认预览。请先在对话区点击“确认应用”或“保留此阶段”，再修改属性；也可以放弃预览。':'模型正在生成，请先等待完成或停止生成，再修改属性。'}</p>:null;

  const node = selection.length > 0 ? doc.nodes.find((n) => n.id === selection[0]) : undefined;

  if (!node) {
    return (
      <div className="flex flex-col h-full bg-[#252A31] text-gray-200">
        <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-black/30 tracking-wider">属性</div>
        <div className="px-3 py-6 text-xs text-gray-500 text-center">未选中对象</div>
      </div>
    );
  }

  if(selection.length>1){
    const ids=new Set(selection);const members=doc.nodes.filter(n=>ids.has(n.id));const assembly=node.assemblyId;
    const same=!!assembly&&members.every(n=>n.assemblyId===assembly)&&members.length===doc.nodes.filter(n=>n.assemblyId===assembly).length;
    return <div className="p-4 bg-[#252A31] text-gray-200 text-sm h-full overflow-auto"><h3>{same?node.assemblyName??'组件':'多选对象'}</h3>{lockNotice}<p className="text-xs text-gray-400 my-3">已选 {members.length} 个零件。外观修改只影响所选范围，可撤销。</p>
      <fieldset disabled={locked} className="disabled:opacity-50">{same&&<div className="grid grid-cols-2 gap-2">{([['左移 1m',[-1,0,0]],['右移 1m',[1,0,0]],['前移 1m',[0,0,1]],['后移 1m',[0,0,-1]]] as const).map(([title,value])=><button key={title} className="rounded bg-white/10 p-2 text-xs" onClick={()=>{const r=applyCommandBatch([{op:'translateAssembly',targetId:node.id,value:[...value]}],title);if(!r.ok)window.alert(r.error);}}>{title}</button>)}</div>}
      <AppearanceEditor key={members.map(n=>n.id+':'+n.materialId).join('|')} doc={doc} nodes={members} wholeAssembly={same}/></fieldset>
      <p className="mt-4 text-xs text-gray-400">展开对象树后选择单个零件，可编辑它的尺寸与位置。</p></div>;
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
      {lockNotice}
      <fieldset disabled={locked} className="flex-1 overflow-auto p-3 space-y-4 text-sm disabled:opacity-50">
        {/* 名称 */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">名称</label>
          <input
            type="text"
            key={`${node.id}:${node.name}`}
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
                key={`${node.id}:${i}:${v}`}
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
                  <input aria-label={`几何参数 ${k}`} type="number" step="any" key={`${node.id}:${k}:${v}`} defaultValue={v} className="min-w-0 w-full bg-black/30 border border-white/10 rounded px-2 py-1" onBlur={e=>{const value=Number(e.target.value);if(!e.target.value.trim()||!Number.isFinite(value)){e.target.value=String(v);return;}if(value===v)return;const geometry={...g,params:{...g.params,[k]:value}} as Geometry;const r=applyCommandBatch([{op:'updateParameters',targetId:node.id,geometry}],`修改 ${node.name} ${k}`);if(!r.ok){window.alert(r.error);e.target.value=String(v);}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
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

        <AppearanceEditor key={node.id+':'+node.materialId} doc={doc} nodes={[node]} wholeAssembly={false}/>
      </fieldset>
    </div>
  );
}

function AppearanceEditor({doc,nodes,wholeAssembly}:{doc:SceneDocument;nodes:SceneNode[];wholeAssembly:boolean}){
  const first=doc.materials.find(m=>m.id===nodes[0]?.materialId);
  const [color,setColor]=useState(first?.baseColor??'#9099a4');
  const [roughness,setRoughness]=useState(String(first?.roughness??.5));
  const [metalness,setMetalness]=useState(String(first?.metalness??0));
  const [opacity,setOpacity]=useState(String(first?.opacity??1));
  const [sourceId,setSourceId]=useState('all');const [notice,setNotice]=useState('');
  const originals=[...new Set(nodes.map(n=>n.materialId).filter((id):id is string=>!!id))];
  const targets=sourceId==='all'?nodes:nodes.filter(n=>n.materialId===sourceId);
  const apply=(patch:AppearancePatch&{materialId?:string},label:string)=>{
    const operations:Command[]=wholeAssembly?[{op:'setAppearance',targetId:nodes[0].id,scope:'assembly',...(sourceId==='all'?{}:{sourceMaterialIds:[sourceId]}),...patch}]:targets.map(n=>({op:'setAppearance',targetId:n.id,...patch}));
    if(!operations.length){setNotice('没有匹配的零件');return;}
    const result=useEditorStore.getState().applyCommandBatch(operations,label);setNotice(result.ok?'已修改，可撤销':result.error??'修改失败');
  };
  return <section className="mt-4 space-y-3"><h4 className="text-xs text-gray-300">颜色与材质</h4>
    {nodes.length>1&&<label className="block text-xs">修改范围<select aria-label="外观修改范围" value={sourceId} onChange={e=>setSourceId(e.target.value)} className="block mt-1 bg-[#20252b] border border-white/10 p-1 w-full"><option value="all">全部选中零件（{nodes.length}）</option>{originals.map(id=><option key={id} value={id}>原材质 {doc.materials.find(m=>m.id===id)?.baseColor??id}（{nodes.filter(n=>n.materialId===id).length}）</option>)}</select></label>}
    <p className="text-xs text-gray-400">本次影响 {targets.length} 个零件；修改颜色会保留各零件原有的粗糙度、金属度和透明度。</p>
    <div className="flex gap-2 items-center"><input aria-label="选择颜色" type="color" value={/^#[0-9a-f]{6}$/i.test(color)?color:'#9099a4'} onChange={e=>setColor(e.target.value)} className="w-9 h-8 shrink-0"/><input aria-label="颜色十六进制" value={color} onChange={e=>setColor(e.target.value)} className="w-24 min-w-0 bg-black/30 rounded px-2 py-1 text-xs"/><button className="bg-blue-600 rounded px-2 py-1 text-xs" onClick={()=>{if(!/^#[0-9a-f]{6}$/i.test(color)){setNotice('请输入 #RRGGBB 颜色');return;}apply({baseColor:color},'修改选中对象颜色')}}>应用颜色</button></div>
    <div className="grid grid-cols-3 gap-2">{([['粗糙度',roughness,setRoughness],['金属度',metalness,setMetalness],['不透明度',opacity,setOpacity]] as const).map(([label,value,set])=><label key={label} className="text-xs">{label}<input aria-label={label} type="number" min="0" max="1" step="0.05" value={value} onChange={e=>set(e.target.value)} className="block w-full min-w-0 rounded bg-black/30 p-1 mt-1"/></label>)}</div>
    <button className="bg-white/10 rounded px-2 py-1 text-xs" onClick={()=>{const values=[roughness,metalness,opacity];if(values.some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1)){setNotice('材质参数需为0–1');return;}apply({roughness:Number(roughness),metalness:Number(metalness),opacity:Number(opacity)},'修改选中对象材质参数')}}>应用材质参数</button>
    <p className="text-xs text-gray-400">替换为现有材质（将同时替换颜色与表面参数）</p><div className="flex flex-wrap gap-1">{doc.materials.map(m=><button key={m.id} aria-label={`使用材质 ${m.id}`} title={`${m.id} ${m.baseColor}`} onClick={()=>apply({materialId:m.id},'替换选中对象材质')} className="w-7 h-7 shrink-0 rounded border border-white/30" style={{backgroundColor:m.baseColor}}/>)}</div>
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}

// 各几何类型的局部包围盒（米）
function geomBbox(g: Geometry): [number, number, number] {
  switch (g.type) {
    case 'capsule': return [g.params.radius*2,g.params.length+g.params.radius*2,g.params.radius*2];
    case 'tube': return [g.params.outerRadius*2,g.params.height,g.params.outerRadius*2];
    case 'trapezoid': return [Math.max(g.params.widthTop,g.params.widthBottom),g.params.height,g.params.depth];
    case 'frame':
    case 'roundedPlate':
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
