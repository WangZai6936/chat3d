import {HomeTasks} from './HomeTasks';
import {Button,Card,Badge,TextArea,Dialog} from '@radix-ui/themes';
import {useEffect,useRef,useState} from 'react';
import {CubeIcon,LayersIcon,ArrowRightIcon,PlusIcon,ArrowUpIcon,Cross1Icon} from '@radix-ui/react-icons';
import {createSession,switchSession,useWorkspaceStore} from '../workspace';
import {useEditorStore} from '../store';
import {listModelAssets} from '../domain/modelAssetStorage';
import type {ModelAssetSummary} from '../domain/modelAssets';
import {compressImage} from './ChatPanel';
import {ModelPicker} from './ModelPicker';
import {QualityPicker} from './QualityPicker';
import {assertLibraryReady,projectLabel} from '../domain/libraryNavigation';
import {ProjectThumb} from './ProjectLibrary';

export function StudioHome({onOpen,onLibrary,onGenerate,onConfigure,onTasks,hidden=false}:{onOpen:()=>void;onLibrary:(kind:'asset'|'scene')=>void;onGenerate?:(projectId:string)=>void;onConfigure?:()=>void;onTasks?:()=>void;hidden?:boolean}){
 const sessions=useWorkspaceStore(s=>s.sessions);
 const ready=useWorkspaceStore(s=>s.ready),workspaceError=useWorkspaceStore(s=>s.error);
 const [kind,setKind]=useState<'asset'|'scene'>('asset'),[draft,setDraft]=useState(''),[images,setImages]=useState<string[]>([]),[preview,setPreview]=useState<string|null>(null),[imageBusy,setImageBusy]=useState(false);
 const [items,setItems]=useState<ModelAssetSummary[]>([]),[error,setError]=useState('');
 const creating=useRef(false),imageBusyRef=useRef(false),fileRef=useRef<HTMLInputElement>(null);
 const locked=!ready||!!workspaceError;
 useEffect(()=>{if(hidden)return;let alive=true;listModelAssets().then(a=>{if(alive)setItems(a);}).catch(()=>{if(alive)setItems([]);});return()=>{alive=false;};},[hidden]);
 const recent=sessions.filter(s=>!s.deletedAt&&(s.moduleKind||s.snapshot.doc.nodes.length||s.snapshot.messages.length)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,12);
 function startProject(){
  if(creating.current)return;
  creating.current=true;
  try{
   assertLibraryReady();
   if(imageBusyRef.current)throw Error('图片正在处理，请稍候');
   if(!draft.trim()&&!images.length)throw Error('请输入需求或添加参考图');
   const config=useEditorStore.getState().aiConfig;
   if(!config||config.useMock||!config.baseURL.trim()||!config.apiKey.trim()||!config.model.trim()){onConfigure?.();throw Error('请先连接并选择模型，输入内容已保留');}
   if(config.agentMode!=='single'&&config.stream===false)throw Error('请在连接设置中开启流式输出，或选择单次生成模式');
   const title=draft.trim().split('\n')[0].slice(0,36)||(kind==='asset'?'参考图资产':'参考图场景');
   if(!createSession(undefined,{moduleKind:kind,title, ...(kind==='asset'?{assetCategory:'其他' as const}:{})}))throw Error('当前无法新建，请先处理存储异常');
   // An explicit home submit authorizes one generation in a new project. Images stay in that project.
   useEditorStore.getState().setComposerText(draft);useEditorStore.getState().setComposerImages([...images]);
   const projectId=useEditorStore.getState().doc.projectId;
   setDraft('');setImages([]);setError('');onOpen();onGenerate?.(projectId);
  }catch(e){setError(e instanceof Error?e.message:'新建失败');creating.current=false;}
 }
 async function addImages(files:File[]){if(imageBusyRef.current)return;imageBusyRef.current=true;setImageBusy(true);setError('');const prepared:string[]=[];try{for(const file of files){if(images.length+prepared.length>=4){setError('每次最多4张参考图');break;}if(!file.type.startsWith('image/'))continue;if(file.size>20*1024*1024){setError('单张图片不能超过20MB');continue;}prepared.push(await compressImage(file));}setImages(old=>[...old,...prepared].slice(0,4));}catch{setError('图片处理失败，请重新选择');}finally{imageBusyRef.current=false;setImageBusy(false)}}
 // A new visit can start another project; repeated submit events within the current visit cannot.
 useEffect(()=>{if(!hidden)creating.current=false;},[hidden]);
 return <main className="home-page home-command-center" hidden={hidden}>
  <section className="home-creation" aria-labelledby="home-title">
   <div className="home-create-column">
   <header className="home-panel-heading"><h1 id="home-title">开始新的创作</h1></header>
   <form className="home-composer" aria-label="创建项目" onSubmit={e=>{e.preventDefault();startProject();}}>
    <TextArea onPaste={e=>{const files=Array.from(e.clipboardData.items).filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter((f):f is File=>!!f);if(files.length){e.preventDefault();void addImages(files);}}} aria-label="新项目描述" value={draft} onChange={e=>setDraft(e.target.value)} rows={7} placeholder="描述你想创建的模型，或继续修改已有场景…"/>
    {!!images.length&&<div className="home-reference-images">{images.map((image,i)=><div key={i}><button type="button" aria-label={`预览首页参考图 ${i+1}`} onClick={()=>setPreview(image)}><img src={image} alt={`首页参考图 ${i+1}`}/></button><Button type="button" variant="ghost" color="gray" aria-label={`移除首页参考图 ${i+1}`} onClick={()=>setImages(old=>old.filter((_,j)=>i!==j))}><Cross1Icon/></Button></div>)}</div>}
    <div className="home-composer-actions">
     <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void addImages(files);}}/>
     <Button type="button" className="composer-icon home-add-image" aria-label={imageBusy?'正在处理参考图':'添加参考图'} title="添加参考图（最多4张）" variant="ghost" color="gray" disabled={imageBusy||images.length>=4} onClick={()=>fileRef.current?.click()}><PlusIcon/>{images.length>0&&<span className="attachment-count">{images.length}</span>}</Button>
     <div className="home-kind-switch" role="group" aria-label="新项目类型"><button type="button" aria-pressed={kind==='asset'} onClick={()=>setKind('asset')}><CubeIcon/>资产</button><button type="button" aria-pressed={kind==='scene'} onClick={()=>setKind('scene')}><LayersIcon/>场景</button></div>
     <QualityPicker forNewProject onConfigure={onConfigure}/><div className="composer-spacer"/><ModelPicker forNewProject onConfigure={onConfigure}/>
     <Button className="primary home-start composer-send" aria-label="开始生成" title="开始生成" type="submit" disabled={locked||imageBusy||(!draft.trim()&&!images.length)}><ArrowUpIcon/><span>开始生成</span></Button>
    </div>
   </form>

   {error&&<p className="resource-error" role="alert">{error}</p>}
   </div>
   <HomeTasks items={items} disabled={locked} hidden={hidden} onOpen={onOpen} onAll={onTasks}/>

  </section>
  <div className="home-section-title"><h2>最近项目 <span className="home-project-count">{recent.length}</span></h2><div><Button variant="ghost" color="gray" disabled={locked} aria-label="查看全部资产" onClick={()=>onLibrary('asset')}>资产库 <ArrowRightIcon/></Button><Button variant="ghost" color="gray" disabled={locked} aria-label="查看全部场景" onClick={()=>onLibrary('scene')}>场景库 <ArrowRightIcon/></Button></div></div>
  <div className="home-recent">{recent.map(s=><Card asChild key={s.id}><article><button className="home-project-link" aria-label={`继续编辑 ${s.title}`} disabled={locked} onClick={()=>{if(switchSession(s.id))onOpen();else setError('请先处理工作区保存异常');}}><ProjectThumb src={s.sceneThumbnail??items.find(a=>a.id===s.assetSource?.id)?.thumbnail} name={s.title} kind={s.moduleKind??'scene'}/><div className="home-project-caption"><h3>{s.title}</h3><p className="home-project-updated">{new Date(s.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · {s.snapshot.doc.nodes.length} 个零件</p><div><Badge variant="soft" color="gray" className="home-kind">{s.moduleKind==='asset'?<CubeIcon/>:<LayersIcon/>}{s.moduleKind==='asset'?'资产':'场景'}</Badge><span>{projectLabel(s)}</span></div></div></button></article></Card>)}</div>
  {!recent.length&&<div className="resource-empty home-empty"><LayersIcon/><h2>开始你的第一个项目</h2><p>在上方描述你的想法，选择资产或场景。</p></div>}
  <footer className="resource-footer">当前浏览器保存 · 资产与场景独立管理 · 对话保留在对应项目中</footer>
  <Dialog.Root open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}}><Dialog.Content maxWidth="800px"><Dialog.Title>参考图</Dialog.Title>{preview&&<img src={preview} alt="首页参考图大图" style={{maxHeight:'65vh',width:'100%',objectFit:'contain'}}/>}<Dialog.Close><Button>关闭参考图</Button></Dialog.Close></Dialog.Content></Dialog.Root>
 </main>;
}
