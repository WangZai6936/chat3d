import {useRef,useState} from 'react';
import {Button,TextField} from '@radix-ui/themes';
import {TeamClient,assetPublication,scenePublication,copyTeamVersion,type TeamItem,type TeamVersion,type TeamPublish} from '../domain/teamLibrary';
import {listModelAssets,readModelAsset} from '../domain/modelAssetStorage';
import {assetDocument,parseModelAsset} from '../domain/modelAssets';
import {parseProject} from '../domain/project';
import {flushWorkspace,useWorkspaceStore} from '../workspace';
import {captureLibraryThumbnail} from '../scene/libraryThumbnail';
import './team-library.css';
export function TeamLibrary({kind,onCopied}:{kind:'asset'|'scene';onCopied?:()=>void}){
 const [open,setOpen]=useState(false),[address,setAddress]=useState(()=>localStorage.getItem('chat3d.team.address')??''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[client,setClient]=useState<TeamClient>(),[rows,setRows]=useState<TeamItem[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState<TeamVersion>(),[image,setImage]=useState(''),[sources,setSources]=useState<{id:string;name:string;version?:number}[]>([]),[source,setSource]=useState(''),[target,setTarget]=useState(''),[prepared,setPrepared]=useState<TeamPublish>();
 const lock=useRef(false),attempted=useRef(false);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e instanceof Error?e.message:'操作失败，可重试');}finally{lock.current=false;setBusy(false);}}
 async function loadSources(){await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('请先修复本地保存错误');setSources(kind==='asset'?(await listModelAssets()).map(a=>({id:a.id,name:a.name,version:a.version})):useWorkspaceStore.getState().sessions.filter(s=>!s.deletedAt&&(s.moduleKind??'scene')==='scene').map(s=>({id:s.id,name:s.title})));}
 async function prepare(){
  await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('请先修复本地保存错误');
  const local=sources.find(s=>s.id===source);if(!local)throw Error('请选择要发布的本地内容');
  let payload:unknown,description='';
  if(kind==='asset'){const asset=assetPublication(await readModelAsset(local.id,local.version!));payload=asset;description=asset.description??'';}
  else {const session=useWorkspaceStore.getState().sessions.find(s=>s.id===source&&!s.deletedAt);if(!session)throw Error('本地场景已删除');if(session.snapshot.pendingBatch||session.snapshot.wasRunning)throw Error('请先完成生成并处理预览');payload=scenePublication(session.snapshot.doc);description=session.libraryDescription??'';}
  const original=rows.find(r=>r.id===target);if(target&&!original)throw Error('请刷新团队库后选择原件');
  attempted.current=false;setPrepared({kind,name:local.name,description,payload,key:crypto.randomUUID(),expectedVersion:original?.version??0,...(original?{itemId:original.id}:{})});
 }
 return <section className="team-library" aria-label="团队共享">
 <Button variant="soft" color="gray" disabled={busy} onClick={()=>setOpen(!open)}>{open?'收起团队库':'打开团队'+(kind==='asset'?'资产库':'场景库')}</Button>
 {open&&<div className="team-panel"><h2>公司团队{kind==='asset'?'资产库':'场景库'}</h2><p>个人草稿仅保存在本机。只有确认发布的模型内容会上传，不含对话、附件或模型服务密钥。</p>
 {!client?<form onSubmit={e=>{e.preventDefault();void run(async()=>{const next=new TeamClient(address);await next.login(username,password);localStorage.setItem('chat3d.team.address',next.base);setPassword('');setClient(next);setRows(await next.list(kind));await loadSources();});}}>
 <TextField.Root aria-label="团队服务地址" placeholder="https://team.company.example" value={address} onChange={e=>setAddress(e.target.value)} disabled={busy}/>
 <TextField.Root aria-label="团队账号" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/>
 <TextField.Root aria-label="团队密码" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><Button disabled={busy}>登录团队</Button></form>:<>
 <div className="team-actions"><span>{client.user?.name} · {client.user?.role}</span><Button disabled={busy} variant="soft" onClick={()=>void run(async()=>{try{await client.logout();}finally{setClient(undefined);setRows([]);setPreview(undefined);setPrepared(undefined);setImage('');}})}>退出团队</Button></div>
 <form onSubmit={e=>{e.preventDefault();void run(async()=>{setRows(await client.list(kind,query));await loadSources();});}}><TextField.Root aria-label="搜索团队库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、说明"/><Button disabled={busy}>搜索 / 刷新</Button></form>
 <div className="team-results">{rows.length===0?<p>暂无匹配的发布内容</p>:rows.map(row=><article key={row.id}><strong>{row.name}</strong><span> v{row.version}</span><p>{row.description}</p><Button disabled={busy} variant="soft" onClick={()=>void run(async()=>{const value=await client.read(row);const doc=value.kind==='asset'?assetDocument(parseModelAsset(JSON.stringify(value.payload))):parseProject(JSON.stringify(value.payload));setPreview(value);setImage('');const thumbnail=await captureLibraryThumbnail(doc);setImage(thumbnail.image);})}>预览 {row.name}</Button></article>)}</div>
 {preview&&<article className="team-preview"><h3>{preview.name} · 固定版本 v{preview.version}</h3>{image&&<img src={image} alt={`${preview.name} 团队版本预览`}/>}<p>复制后可在本地库独立编辑和复用，原件不会改变。</p><Button disabled={busy} onClick={()=>void run(async()=>{await copyTeamVersion(preview);onCopied?.();setNotice('已复制为独立本地副本；重新打开本地库即可查看。');})}>复制到本地</Button></article>}
 {client.user?.role!=='viewer'&&<div className="team-publish"><h3>选择性发布</h3><label>本地{kind==='asset'?'资产':'场景'}<select aria-label="发布本地内容" value={source} disabled={busy||!!prepared} onChange={e=>setSource(e.target.value)}><option value="">请选择，不会自动上传</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}{s.version?` v${s.version}`:''}</option>)}</select></label><label>发布位置<select aria-label="发布位置" value={target} disabled={busy||!!prepared} onChange={e=>setTarget(e.target.value)}><option value="">新团队原件</option>{rows.filter(r=>r.owner===client.user?.id||client.user?.role==='admin').map(r=><option key={r.id} value={r.id}>更新 {r.name}（当前 v{r.version}）</option>)}</select></label>
 {!prepared?<Button disabled={busy||!source} onClick={()=>void run(prepare)}>准备发布</Button>:<div role="group" aria-label="确认团队发布"><p>将发布「{prepared.name}」为{prepared.itemId?`新版本 v${prepared.expectedVersion+1}`:'新团队原件'}，全体团队成员可查看并复制。包含完整几何快照。</p><Button disabled={busy} onClick={()=>void run(async()=>{attempted.current=true;const result=await client.publish(prepared);setPrepared(undefined);setNotice(`已发布 v${result.version}`);setRows(await client.list(kind,query));})}>{attempted.current?'重试同一次发布':'确认发布'}</Button><Button disabled={busy} variant="soft" onClick={()=>{setPrepared(undefined);setNotice(attempted.current?'已停止重试。请求可能已提交，请刷新团队库确认；已发布版本不会撤回。':'发布已取消，没有上传。');}}>取消</Button></div>}</div>}
 </>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">处理中…</p>}</div>}
 </section>;
}
