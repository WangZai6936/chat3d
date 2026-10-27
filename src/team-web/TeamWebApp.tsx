import {useRef,useState} from 'react';
import {Button,TextField,Badge} from '@radix-ui/themes';
import {CubeIcon,LayersIcon,MagnifyingGlassIcon,LockClosedIcon,PersonIcon,DesktopIcon} from '@radix-ui/react-icons';
import {TeamClient,defaultTeamServiceBase,rememberTeamServiceBase,type TeamItem,type TeamVersion} from '../domain/teamLibrary';
import {assetDocument,parseModelAsset} from '../domain/modelAssets';
import {parseProject} from '../domain/project';
import {captureLibraryThumbnail} from '../scene/libraryThumbnail';
import {downloadTeamCopyFile} from '../domain/teamCopyExport';
import {BrandMark} from '../ui/BrandMark';

export function TeamWebApp(){
 const [kind,setKind]=useState<'asset'|'scene'>('asset'),[address,setAddress]=useState(()=>defaultTeamServiceBase()||window.location.origin),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[client,setClient]=useState<TeamClient>(),[rows,setRows]=useState<TeamItem[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState<TeamVersion>(),[image,setImage]=useState('');
 const lock=useRef(false);
 const kindLabel=kind==='asset'?'资产':'场景';
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e instanceof Error?e.message:'操作失败，可重试');}finally{lock.current=false;setBusy(false);}}
 return <div className="team-web-shell">
 <header className="team-web-header"><BrandMark/><div><strong>Scenivo</strong><span>团队库 · 浏览器轻量版</span></div></header>
 <main className="team-web-main resource-page team-web-page">
 <header className="resource-heading team-web-heading"><div><span className="resource-eyebrow">公司共享</span><h1>浏览公司共享的 3D {kindLabel}</h1><p>登录后可搜索、预览固定版本，并下载可在桌面 Scenivo 导入的副本包。本页不提供 AI 生成或在线编辑；发布请在桌面客户端「团队」页完成。</p></div></header>
 <div className="resource-toolbar team-web-kind-bar"><div className="resource-segments team-web-kind" role="group" aria-label="内容类型"><Button variant="soft" color="gray" aria-pressed={kind==='asset'} onClick={()=>void run(async()=>{setKind('asset');setPreview(undefined);setImage('');if(client)setRows(await client.list('asset',query));})}><CubeIcon/>团队资产</Button><Button variant="soft" color="gray" aria-pressed={kind==='scene'} onClick={()=>void run(async()=>{setKind('scene');setPreview(undefined);setImage('');if(client)setRows(await client.list('scene',query));})}><LayersIcon/>团队场景</Button></div></div>
 <div className="team-panel team-web-panel">
 {!client?<section className="team-auth-layout team-web-auth">
 <div className="team-auth-intro">
 <p className="team-auth-eyebrow">浏览器轻量版</p>
 <h2>登录团队服务</h2>
 <p>与桌面端相同的团队库内容，适合快速查阅与下载导入包。</p>
 <ul className="team-auth-points">
 <li><DesktopIcon aria-hidden/> 下载包可在桌面 Scenivo 导入</li>
 <li><PersonIcon aria-hidden/> 使用公司团队账号</li>
 <li><LockClosedIcon aria-hidden/> 关闭页面后需重新登录</li>
 </ul>
 </div>
 <form className="team-login-card" onSubmit={e=>{e.preventDefault();void run(async()=>{const next=new TeamClient(address);await next.login(username,password);rememberTeamServiceBase(next.base);setPassword('');setClient(next);setRows(await next.list(kind));});}}>
 <header><h3>登录团队库</h3><p>默认使用当前站点作为服务地址，可按需修改。</p></header>
 <label className="team-field"><span className="team-field-label">团队服务地址</span><TextField.Root size="3" aria-label="团队服务地址" value={address} onChange={e=>setAddress(e.target.value)} disabled={busy}/></label>
 <label className="team-field"><span className="team-field-label">团队账号</span><TextField.Root size="3" aria-label="团队账号" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
 <label className="team-field"><span className="team-field-label">团队密码</span><TextField.Root size="3" aria-label="团队密码" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
 <div className="team-login-actions"><Button size="3" disabled={busy} type="submit">登录团队</Button></div>
 </form>
 </section>:<div className="team-workspace">
 <header className="team-session-bar team-web-session"><div><strong>{client.user?.name}</strong><span className="team-session-meta"><Badge color="gray" variant="soft">{client.user?.role}</Badge> · 已连接</span></div><Button variant="soft" color="gray" disabled={busy} onClick={()=>void run(async()=>{try{await client.logout();}finally{setClient(undefined);setRows([]);setPreview(undefined);setImage('');}})}>退出</Button></header>
 <form className="team-search-bar team-web-search" onSubmit={e=>{e.preventDefault();void run(async()=>setRows(await client.list(kind,query)));}}><TextField.Root size="3" className="team-search-input" aria-label="搜索团队库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、说明"><TextField.Slot><MagnifyingGlassIcon/></TextField.Slot></TextField.Root><Button size="3" disabled={busy} variant="soft" color="gray">搜索</Button></form>
 <div className={`team-browser resource-browser team-web-browser ${preview?'has-detail':''}`}>
 <section className="team-results-wrap"><div className="team-results-heading resource-results-heading"><span>团队{kindLabel}</span><span>{rows.length} 项结果</span></div>
 <div className="team-results team-web-results">{rows.length===0?<div className="team-empty-state"><p className="team-empty">暂无匹配内容。</p></div>:rows.map(row=><article key={row.id} className="team-result-card"><div className="team-result-body"><strong>{row.name}</strong><Badge color="gray" variant="soft">v{row.version}</Badge>{row.description&&<p>{row.description}</p>}</div><Button disabled={busy} variant="soft" color="gray" onClick={()=>void run(async()=>{const value=await client.read(row);const doc=value.kind==='asset'?assetDocument(parseModelAsset(JSON.stringify(value.payload))):parseProject(JSON.stringify(value.payload));setPreview(value);setImage('');setImage((await captureLibraryThumbnail(doc)).image);})}>预览</Button></article>)}</div></section>
 {preview&&<aside className="team-preview team-web-preview" aria-label="预览"><div className="team-preview-head"><h3>{preview.name}</h3><Button variant="ghost" color="gray" aria-label="关闭预览" onClick={()=>{setPreview(undefined);setImage('');}}>关闭</Button></div><p className="team-preview-version">v{preview.version}</p>{image?<img src={image} alt={`${preview.name} 预览`}/>:<div className="team-preview-placeholder">正在生成预览…</div>}<p className="team-preview-copy">下载副本后，在桌面 Scenivo 导入：资产 JSON → 资产库「模型资产库」；场景文件 → 工作台「打开项目」。</p><Button size="3" disabled={busy} onClick={()=>void run(async()=>setNotice(downloadTeamCopyFile(preview)))}>下载桌面导入包</Button></aside>}
 </div>
 </div>}
 {(notice||busy)&&<p className={`team-status team-web-notice${notice?' is-notice':''}`} role="status">{busy?'处理中…':notice}</p>}
 </div>
 </main>
 <footer className="team-web-footer resource-footer"><span>数据保存在公司团队服务；会话关闭后需重新登录。</span></footer>
 </div>;
}
