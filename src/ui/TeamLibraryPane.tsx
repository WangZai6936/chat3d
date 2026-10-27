import {useRef,useState} from 'react';
import {Button,TextField,Badge} from '@radix-ui/themes';
import {MagnifyingGlassIcon,LockClosedIcon,PersonIcon,DesktopIcon} from '@radix-ui/react-icons';
import {TeamClient,assetPublication,scenePublication,defaultTeamServiceBase,rememberTeamServiceBase,copyTeamVersion,type TeamItem,type TeamVersion,type TeamPublish} from '../domain/teamLibrary';
import {listModelAssets,readModelAsset} from '../domain/modelAssetStorage';
import {assetDocument,parseModelAsset} from '../domain/modelAssets';
import {parseProject} from '../domain/project';
import {flushWorkspace,useWorkspaceStore} from '../workspace';
import {captureLibraryThumbnail} from '../scene/libraryThumbnail';
import './team-library.css';

export function TeamLibraryPane({kind,onCopied,showPublish=true}:{kind:'asset'|'scene';onCopied?:()=>void;showPublish?:boolean}){
 const [address,setAddress]=useState(()=>defaultTeamServiceBase()),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[client,setClient]=useState<TeamClient>(),[rows,setRows]=useState<TeamItem[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState<TeamVersion>(),[image,setImage]=useState(''),[sources,setSources]=useState<{id:string;name:string;version?:number}[]>([]),[source,setSource]=useState(''),[target,setTarget]=useState(''),[prepared,setPrepared]=useState<TeamPublish>();
 const lock=useRef(false),attempted=useRef(false);
 const kindLabel=kind==='asset'?'资产':'场景';
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e instanceof Error?e.message:'操作失败，可重试');}finally{lock.current=false;setBusy(false);}}
 async function loadSources(){if(!showPublish)return;await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('请先修复本地保存错误');setSources(kind==='asset'?(await listModelAssets()).map(a=>({id:a.id,name:a.name,version:a.version})):useWorkspaceStore.getState().sessions.filter(s=>!s.deletedAt&&(s.moduleKind??'scene')==='scene').map(s=>({id:s.id,name:s.title})));}
 async function prepare(){
  await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('请先修复本地保存错误');
  const local=sources.find(s=>s.id===source);if(!local)throw Error('请选择要发布的本地内容');
  let payload:unknown,description='';
  if(kind==='asset'){const asset=assetPublication(await readModelAsset(local.id,local.version!));payload=asset;description=asset.description??'';}
  else {const session=useWorkspaceStore.getState().sessions.find(s=>s.id===source&&!s.deletedAt);if(!session)throw Error('本地场景已删除');if(session.snapshot.pendingBatch||session.snapshot.wasRunning)throw Error('请先完成生成并处理预览');payload=scenePublication(session.snapshot.doc);description=session.libraryDescription??'';}
  const original=rows.find(r=>r.id===target);if(target&&!original)throw Error('请刷新团队库后选择原件');
  attempted.current=false;setPrepared({kind,name:local.name,description,payload,key:crypto.randomUUID(),expectedVersion:original?.version??0,...(original?{itemId:original.id}:{})});
 }
 return <div className="team-panel" aria-label={kind==='asset'?'团队资产库':'团队场景库'}>
 {!client?<section className="team-auth-layout">
 <div className="team-auth-intro">
 <p className="team-auth-eyebrow">公司共享 · {kindLabel}</p>
 <h2>连接团队服务，浏览同事已发布内容</h2>
 <p>登录后可搜索、预览固定版本，并复制到本机独立编辑。团队原件不会因你的副本而改变。</p>
 <ul className="team-auth-points">
 <li><DesktopIcon aria-hidden/> 浏览与预览无需离开 Scenivo 桌面端</li>
 <li><PersonIcon aria-hidden/> 使用公司分配的团队账号登录</li>
 <li><LockClosedIcon aria-hidden/> 凭据仅用于本次会话，不会写入本地项目</li>
 </ul>
 </div>
 <form className="team-login-card" onSubmit={e=>{e.preventDefault();void run(async()=>{const next=new TeamClient(address);await next.login(username,password);rememberTeamServiceBase(next.base);setPassword('');setClient(next);setRows(await next.list(kind));await loadSources();});}}>
 <header><h3>登录团队库</h3><p>填写服务地址与账号。发布请在登录后使用下方「选择性发布」。</p></header>
 <label className="team-field"><span className="team-field-label">团队服务地址</span><TextField.Root size="3" aria-label="团队服务地址" placeholder="https://portal.company.example" value={address} onChange={e=>setAddress(e.target.value)} disabled={busy}/></label>
 <label className="team-field"><span className="team-field-label">团队账号</span><TextField.Root size="3" aria-label="团队账号" autoComplete="username" placeholder="姓名或工号" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
 <label className="team-field"><span className="team-field-label">团队密码</span><TextField.Root size="3" aria-label="团队密码" type="password" autoComplete="current-password" placeholder="公司分配密码" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
 <div className="team-login-actions"><Button size="3" disabled={busy} type="submit">登录团队</Button></div>
 </form>
 </section>:<div className="team-workspace">
 <header className="team-session-bar"><div><strong>{client.user?.name}</strong><span className="team-session-meta"><Badge color="gray" variant="soft">{client.user?.role}</Badge> · 已连接团队服务</span></div><Button disabled={busy} variant="soft" color="gray" onClick={()=>void run(async()=>{try{await client.logout();}finally{setClient(undefined);setRows([]);setPreview(undefined);setPrepared(undefined);setImage('');}})}>退出团队</Button></header>
 <form className="team-search-bar" onSubmit={e=>{e.preventDefault();void run(async()=>{setRows(await client.list(kind,query));await loadSources();});}}><TextField.Root size="3" className="team-search-input" aria-label="搜索团队库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、说明"><TextField.Slot><MagnifyingGlassIcon/></TextField.Slot></TextField.Root><Button size="3" disabled={busy} variant="soft" color="gray">搜索 / 刷新</Button></form>
 <div className={`team-browser resource-browser ${preview?'has-detail':''}`}>
 <section className="team-results-wrap" aria-label="团队发布列表">
 <div className="team-results-heading resource-results-heading"><span>团队{kindLabel}</span><span>{rows.length} 项结果</span></div>
 <div className="team-results">{rows.length===0?<div className="team-empty-state resource-empty"><p className="team-empty">暂无匹配的发布内容。成员可在桌面端「团队」页选择性发布。</p></div>:rows.map(row=><article key={row.id} className="team-result-card"><div className="team-result-body"><strong>{row.name}</strong><Badge color="gray" variant="soft">v{row.version}</Badge>{row.description&&<p>{row.description}</p>}</div><Button disabled={busy} variant="soft" color="gray" onClick={()=>void run(async()=>{const value=await client.read(row);const doc=value.kind==='asset'?assetDocument(parseModelAsset(JSON.stringify(value.payload))):parseProject(JSON.stringify(value.payload));setPreview(value);setImage('');const thumbnail=await captureLibraryThumbnail(doc);setImage(thumbnail.image);})}>预览 {row.name}</Button></article>)}</div>
 </section>
 {preview&&<aside className="team-preview resource-detail" aria-label="团队版本预览"><div className="team-preview-head"><h3>{preview.name}</h3><Button variant="ghost" color="gray" aria-label="关闭预览" onClick={()=>{setPreview(undefined);setImage('');}}>关闭</Button></div><p className="team-preview-version">固定版本 v{preview.version}</p>{image?<img src={image} alt={`${preview.name} 团队版本预览`}/>:<div className="team-preview-placeholder">正在生成预览…</div>}<p className="team-preview-copy">复制后可在本地库独立编辑和复用，原件不会改变。</p><Button size="3" className="primary" disabled={busy} onClick={()=>void run(async()=>{await copyTeamVersion(preview);onCopied?.();setNotice('已复制为独立本地副本；重新打开本地库即可查看。');})}>复制到本地</Button></aside>}
 </div>
 {showPublish&&client.user?.role!=='viewer'&&<section className="team-publish" aria-label="选择性发布"><header><h3>选择性发布</h3><p>仅上传你确认的内容；不会自动同步本地草稿。</p></header><div className="team-publish-grid"><label className="team-field">本地{kindLabel}<select aria-label="发布本地内容" value={source} disabled={busy||!!prepared} onChange={e=>setSource(e.target.value)}><option value="">请选择，不会自动上传</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}{s.version?` v${s.version}`:''}</option>)}</select></label><label className="team-field">发布位置<select aria-label="发布位置" value={target} disabled={busy||!!prepared} onChange={e=>setTarget(e.target.value)}><option value="">新团队原件</option>{rows.filter(r=>r.owner===client.user?.id||client.user?.role==='admin').map(r=><option key={r.id} value={r.id}>更新 {r.name}（当前 v{r.version}）</option>)}</select></label></div>
 {!prepared?<Button disabled={busy||!source} onClick={()=>void run(prepare)}>准备发布</Button>:<div className="team-publish-confirm" role="group" aria-label="确认团队发布"><p>将发布「{prepared.name}」为{prepared.itemId?`新版本 v${prepared.expectedVersion+1}`:'新团队原件'}，全体团队成员可查看并复制。包含完整几何快照。</p><div className="team-publish-actions"><Button disabled={busy} onClick={()=>void run(async()=>{attempted.current=true;const result=await client.publish(prepared);setPrepared(undefined);setNotice(`已发布 v${result.version}`);setRows(await client.list(kind,query));})}>{attempted.current?'重试同一次发布':'确认发布'}</Button><Button disabled={busy} variant="soft" color="gray" onClick={()=>{setPrepared(undefined);setNotice(attempted.current?'已停止重试。请求可能已提交，请刷新团队库确认；已发布版本不会撤回。':'发布已取消，没有上传。');}}>取消</Button></div></div>}
 </section>}
 </div>}
 {(notice||busy)&&<p className={`team-status${notice?' is-notice':''}`} role="status">{busy?'处理中…':notice}</p>}
 </div>;
}
