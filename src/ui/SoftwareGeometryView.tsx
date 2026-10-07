import {useEffect,useRef,useState} from 'react';
import type {SceneDocument} from '../domain/types';
import type {CaptureView} from '../scene/capture';
import {captureSoftware,isSoftwareCaptureAvailable} from '../scene/softwareCapture';
export function SoftwareGeometryView({doc,selection=[],autoRender=false}:{doc:SceneDocument;selection?:string[];autoRender?:boolean}){
 const [view,setView]=useState<CaptureView>('perspective'),[scope,setScope]=useState<'scene'|'focus'|'isolated'>('scene');
 const [picture,setPicture]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const controller=useRef<AbortController|null>(null);
 const selected=doc.nodes.filter(n=>selection.includes(n.id)&&n.visible&&n.geometry).map(n=>n.id),selectionKey=selected.join('\n');
 useEffect(()=>{controller.current?.abort();setPicture('');setBusy(false);setError('');return()=>controller.current?.abort();},[doc,selectionKey,view,scope]);
 const render=async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');try{
  if(scope!=='scene'&&!selected.length)throw Error('请先在对象与属性中选择可见零件');
  const source=scope==='isolated'?{...doc,nodes:doc.nodes.filter(n=>selected.includes(n.id))}:doc;
  const data=await captureSoftware(source,view,scope==='scene'?undefined:selected,c.signal);if(!c.signal.aborted)setPicture(data);
 }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{if(!c.signal.aborted)setBusy(false);}};
 useEffect(()=>{if(autoRender&&doc.nodes.length&&isSoftwareCaptureAvailable())void render();},[autoRender,doc,selectionKey,view,scope]);
 if(!isSoftwareCaptureAvailable())return null;
 return <section aria-label="软件几何检查" className={`w-full max-w-3xl space-y-2 ${autoRender?'canvas-software-preview':''}`}><p className="text-xs text-amber-200">可使用软件几何检查图查看形体与遮挡，不支持实时旋转、贴图、阴影或材质验收。</p><div className="flex flex-wrap justify-center gap-2">
 <select aria-label="软件检查范围" value={scope} onChange={e=>setScope(e.target.value as typeof scope)} className="bg-gray-800 rounded px-2"><option value="scene">全场景</option><option value="focus">选中近景（保留周边）</option><option value="isolated">仅显示选中零件</option></select>
 <select aria-label="软件检查视角" value={view} onChange={e=>setView(e.target.value as CaptureView)} className="bg-gray-800 rounded px-2">{([['perspective','沙盘'],['front','正面'],['side','右侧'],['left','左侧'],['back','背面'],['top','俯视'],['bottom','仰视'],['underside','斜下仰视']] as const).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button disabled={busy||!doc.nodes.length||(scope!=='scene'&&!selected.length)} onClick={render} className="rounded bg-gray-700 px-3 py-2">{busy?'正在生成几何检查图…':'生成软件检查图'}</button></div>
 {scope!=='scene'&&<p className="text-xs text-gray-300">{selected.length?`已选 ${selected.length} 个可见零件。`:'请在对象与属性中选择零件。'}{scope==='isolated'?'周边已隐藏，不能据此验收与其他对象的连接或间距。':'放大选中对象并保留周边遮挡，可检查局部连接。'}</p>}
 {picture&&<img alt={`软件几何检查图，${scope==='scene'?'全场景':scope==='focus'?'选中近景，保留周边':'仅选中零件，周边已隐藏'}，非材质验收`} src={picture} className="mx-auto max-h-[40vh] max-w-full rounded"/>}{error&&<p role="status">{error}</p>}</section>;
}
