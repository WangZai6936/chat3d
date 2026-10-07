import {Button,Card,Badge,TextArea,Dialog,DropdownMenu} from '@radix-ui/themes';
import {useEffect,useRef,useState} from 'react';
import {CubeIcon,LayersIcon,ArrowRightIcon,PlusIcon,ArrowUpIcon,ChevronDownIcon,Cross1Icon} from '@radix-ui/react-icons';
import {createSession,switchSession,useWorkspaceStore} from '../workspace';
import {useEditorStore} from '../store';
import {listModelAssets} from '../domain/modelAssetStorage';
import type {ModelAssetSummary} from '../domain/modelAssets';
import {compressImage} from './ChatPanel';
import {ModelPicker} from './ModelPicker';
import {QualityPicker} from './QualityPicker';
import {assertLibraryReady,projectLabel} from '../domain/libraryNavigation';
import {ProjectThumb} from './ProjectLibrary';

export function StudioHome({onOpen,onLibrary,onGenerate,onConfigure,hidden=false}:{onOpen:()=>void;onLibrary:(kind:'asset'|'scene')=>void;onGenerate?:(projectId:string)=>void;onConfigure?:()=>void;hidden?:boolean}){
 const sessions=useWorkspaceStore(s=>s.sessions);
 const ready=useWorkspaceStore(s=>s.ready),workspaceError=useWorkspaceStore(s=>s.error);
 const [kind,setKind]=useState<'asset'|'scene'>('asset'),[draft,setDraft]=useState(''),[images,setImages]=useState<string[]>([]),[preview,setPreview]=useState<string|null>(null),[imageBusy,setImageBusy]=useState(false);
 const [items,setItems]=useState<ModelAssetSummary[]>([]),[error,setError]=useState('');
 const [featuredId,setFeaturedId]=useState<string|null>(null);
 const creating=useRef(false),imageBusyRef=useRef(false),fileRef=useRef<HTMLInputElement>(null);
 const locked=!ready||!!workspaceError;
 useEffect(()=>{if(hidden)return;let alive=true;listModelAssets().then(a=>{if(alive)setItems(a);}).catch(()=>{if(alive)setItems([]);});return()=>{alive=false;};},[hidden]);
 const recent=sessions.filter(s=>!s.deletedAt&&(s.moduleKind||s.snapshot.doc.nodes.length||s.snapshot.messages.length)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,12);
 const featured=recent.find(s=>s.id===featuredId)??recent[0];
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
 return <main className="home-page" hidden={hidden}>
  <section className="home-creation" aria-labelledby="home-title">
   <div className="home-create-column">
   <header><h1 id="home-title">用自然语言，创建 3D 资产与场景</h1><p>描述你想要的工业资产或场景，将想法变成可编辑的 3D 模型。</p></header>
   <div className="home-prompt-shortcuts" aria-label="创作示例">{[{label:"生成仓库货架场景",kind:"scene" as const,text:"创建一个包含立体货架、蓝色料箱和安全通道的仓库场景"},{label:"布置生产线",kind:"scene" as const,text:"创建一条包含设备、输送线和工位的生产线"},{label:"创建设备资产",kind:"asset" as const,text:"创建一个可编辑的工业设备资产"},{label:"创建仓储容器",kind:"asset" as const,text:"创建一个蓝色网格塑料周转箱"}].map(p=><Button type="button" key={p.label} variant="soft" color="gray" disabled={locked} onClick={()=>{setKind(p.kind);setDraft(p.text);}}><CubeIcon/>{p.label}</Button>)}</div>
   <form className="home-composer" aria-label="创建项目" onSubmit={e=>{e.preventDefault();startProject();}}>
    <TextArea onPaste={e=>{const files=Array.from(e.clipboardData.items).filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter((f):f is File=>!!f);if(files.length){e.preventDefault();void addImages(files);}}} aria-label="新项目描述" value={draft} onChange={e=>setDraft(e.target.value)} rows={3} placeholder="例如：创建一个 1200 × 1000 mm 的蓝色网格塑料托盘，带九脚支撑，可用于仓储物流"/>
    {!!images.length&&<div className="home-reference-images">{images.map((image,i)=><div key={i}><button type="button" aria-label={`预览首页参考图 ${i+1}`} onClick={()=>setPreview(image)}><img src={image} alt={`首页参考图 ${i+1}`}/></button><Button type="button" variant="ghost" color="gray" aria-label={`移除首页参考图 ${i+1}`} onClick={()=>setImages(old=>old.filter((_,j)=>i!==j))}><Cross1Icon/></Button></div>)}</div>}
    <div className="home-composer-actions">
     <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void addImages(files);}}/>
     <Button type="button" className="composer-icon home-add-image" aria-label={imageBusy?'正在处理参考图':'添加参考图'} title="添加参考图（最多4张）" variant="ghost" color="gray" disabled={imageBusy||images.length>=4} onClick={()=>fileRef.current?.click()}><PlusIcon/>{images.length>0&&<span className="attachment-count">{images.length}</span>}</Button>
     <DropdownMenu.Root><DropdownMenu.Trigger><Button type="button" variant="ghost" color="gray" className="composer-kind" aria-label={`新项目类型，当前${kind==='asset'?'资产':'场景'}`}>{kind==='asset'?<CubeIcon/>:<LayersIcon/>}<span>{kind==='asset'?'资产':'场景'}</span><ChevronDownIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content className="composer-kind-menu" align="start" sideOffset={7} color="gray"><DropdownMenu.RadioGroup value={kind} onValueChange={v=>setKind(v as 'asset'|'scene')}><DropdownMenu.RadioItem value="asset"><CubeIcon/>资产</DropdownMenu.RadioItem><DropdownMenu.RadioItem value="scene"><LayersIcon/>场景</DropdownMenu.RadioItem></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Root>
     <QualityPicker forNewProject onConfigure={onConfigure}/><div className="composer-spacer"/><ModelPicker forNewProject onConfigure={onConfigure}/>
     <Button className="primary home-start composer-send" aria-label="开始生成" title="开始生成" type="submit" disabled={locked||imageBusy||(!draft.trim()&&!images.length)}><ArrowUpIcon/></Button>
    </div>
   </form>

   {error&&<p className="resource-error" role="alert">{error}</p>}
   </div>
   <aside className="home-featured" aria-label="最近项目预览">
    {featured?<><button className="home-featured-open" disabled={locked} aria-label={`打开预览项目 ${featured.title}`} onClick={()=>{if(switchSession(featured.id))onOpen();else setError('请先处理工作区保存异常');}}><div className="home-featured-heading"><Badge color="blue" variant="soft">最近项目</Badge><h2>{featured.title}</h2><p>{new Date(featured.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p><ArrowRightIcon/></div><ProjectThumb src={featured.sceneThumbnail??items.find(a=>a.id===featured.assetSource?.id)?.thumbnail} name={featured.title} kind={featured.moduleKind??'scene'}/></button><div className="home-featured-choices" aria-label="切换项目预览">{recent.slice(0,3).map(s=><button key={s.id} type="button" aria-label={`预览项目 ${s.title}`} aria-pressed={s.id===featured.id} onClick={()=>setFeaturedId(s.id)}><ProjectThumb src={s.sceneThumbnail??items.find(a=>a.id===s.assetSource?.id)?.thumbnail} name={s.title} kind={s.moduleKind??'scene'}/><span>{s.title}</span></button>)}</div></>:<div className="home-featured-empty"><LayersIcon/><h2>你的创作，从这里开始</h2><p>创建项目后，这里会展示你的模型预览。</p></div>}
   </aside>
  </section>
  <div className="home-section-title"><h2>最近项目 <span className="home-project-count">{recent.length}</span></h2><div><Button variant="ghost" color="gray" disabled={locked} aria-label="查看全部资产" onClick={()=>onLibrary('asset')}>资产库 <ArrowRightIcon/></Button><Button variant="ghost" color="gray" disabled={locked} aria-label="查看全部场景" onClick={()=>onLibrary('scene')}>场景库 <ArrowRightIcon/></Button></div></div>
  <div className="home-recent">{recent.map(s=><Card asChild key={s.id}><article><button className="home-project-link" aria-label={`继续编辑 ${s.title}`} disabled={locked} onClick={()=>{if(switchSession(s.id))onOpen();else setError('请先处理工作区保存异常');}}><ProjectThumb src={s.sceneThumbnail??items.find(a=>a.id===s.assetSource?.id)?.thumbnail} name={s.title} kind={s.moduleKind??'scene'}/><div className="home-project-caption"><h3>{s.title}</h3><p className="home-project-updated">{new Date(s.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · {s.snapshot.doc.nodes.length} 个零件</p><div><Badge variant="soft" color="gray" className="home-kind">{s.moduleKind==='asset'?<CubeIcon/>:<LayersIcon/>}{s.moduleKind==='asset'?'资产':'场景'}</Badge><span>{projectLabel(s)}</span></div></div></button></article></Card>)}</div>
  {!recent.length&&<div className="resource-empty home-empty"><LayersIcon/><h2>开始你的第一个项目</h2><p>在上方描述你的想法，选择资产或场景。</p></div>}
  <footer className="resource-footer">当前浏览器保存 · 资产与场景独立管理 · 对话保留在对应项目中</footer>
  <Dialog.Root open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}}><Dialog.Content maxWidth="800px"><Dialog.Title>参考图</Dialog.Title>{preview&&<img src={preview} alt="首页参考图大图" style={{maxHeight:'65vh',width:'100%',objectFit:'contain'}}/>}<Dialog.Close><Button>关闭参考图</Button></Dialog.Close></Dialog.Content></Dialog.Root>
 </main>;
}
