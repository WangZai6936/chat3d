import {useRef,useState} from 'react';
import {Button,TextField} from '@radix-ui/themes';
import {CubeIcon,LayersIcon,MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {TeamClient,defaultTeamServiceBase,rememberTeamServiceBase,type TeamItem,type TeamVersion} from '../domain/teamLibrary';
import {assetDocument,parseModelAsset} from '../domain/modelAssets';
import {parseProject} from '../domain/project';
import {captureLibraryThumbnail} from '../scene/libraryThumbnail';
import {downloadTeamCopyFile} from '../domain/teamCopyExport';
import {BrandMark} from '../ui/BrandMark';

export function TeamWebApp(){
 const [kind,setKind]=useState<'asset'|'scene'>('asset'),[address,setAddress]=useState(()=>defaultTeamServiceBase()||window.location.origin),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[client,setClient]=useState<TeamClient>(),[rows,setRows]=useState<TeamItem[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState<TeamVersion>(),[image,setImage]=useState('');
 const lock=useRef(false);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e instanceof Error?e.message:'操作失败，可重试');}finally{lock.current=false;setBusy(false);}}
 return <div className="team-web-shell">
 <header className="team-web-header"><BrandMark/><div><strong>Scenivo</strong><span>团队库 · 浏览器轻量版</span></div></header>
 <main className="team-web-main">
 <section className="team-web-intro"><h1>浏览公司共享的 3D 资产与场景</h1><p>登录后可搜索、预览固定版本，并下载可在桌面 Scenivo 导入的副本包。本页不提供 AI 生成或在线编辑；发布请在桌面客户端「团队」页完成。</p></section>
 {!client?<form className="team-web-login" onSubmit={e=>{e.preventDefault();void run(async()=>{const next=new TeamClient(address);await next.login(username,password);rememberTeamServiceBase(next.base);setPassword('');setClient(next);setRows(await next.list(kind));});}}>
 <TextField.Root aria-label="团队服务地址" value={address} onChange={e=>setAddress(e.target.value)} disabled={busy}/>
 <TextField.Root aria-label="团队账号" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/>
 <TextField.Root aria-label="团队密码" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/>
 <Button disabled={busy} type="submit">登录团队</Button></form>:<>
 <div className="team-web-toolbar"><div className="team-web-kind" role="group" aria-label="内容类型"><Button variant="soft" aria-pressed={kind==='asset'} onClick={()=>void run(async()=>{setKind('asset');setPreview(undefined);setImage('');setRows(await client.list('asset',query));})}><CubeIcon/>资产</Button><Button variant="soft" aria-pressed={kind==='scene'} onClick={()=>void run(async()=>{setKind('scene');setPreview(undefined);setImage('');setRows(await client.list('scene',query));})}><LayersIcon/>场景</Button></div>
 <form className="team-web-search" onSubmit={e=>{e.preventDefault();void run(async()=>setRows(await client.list(kind,query)));}}><TextField.Root aria-label="搜索团队库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索名称、说明"><TextField.Slot><MagnifyingGlassIcon/></TextField.Slot></TextField.Root><Button disabled={busy}>搜索</Button></form>
 <div className="team-web-session"><span>{client.user?.name} · {client.user?.role}</span><Button variant="soft" disabled={busy} onClick={()=>void run(async()=>{try{await client.logout();}finally{setClient(undefined);setRows([]);setPreview(undefined);setImage('');}})}>退出</Button></div></div>
 <div className="team-results team-web-results">{rows.length===0?<p className="team-empty">暂无匹配内容。</p>:rows.map(row=><article key={row.id}><strong>{row.name}</strong><span> v{row.version}</span><p>{row.description}</p><Button disabled={busy} variant="soft" onClick={()=>void run(async()=>{const value=await client.read(row);const doc=value.kind==='asset'?assetDocument(parseModelAsset(JSON.stringify(value.payload))):parseProject(JSON.stringify(value.payload));setPreview(value);setImage('');setImage((await captureLibraryThumbnail(doc)).image);})}>预览</Button></article>)}</div>
 {preview&&<article className="team-preview team-web-preview"><h2>{preview.name} · v{preview.version}</h2>{image&&<img src={image} alt={`${preview.name} 预览`}/>}<p>下载副本后，在桌面 Scenivo 导入：资产 JSON → 资产库「模型资产库」；场景文件 → 工作台「打开项目」。</p><Button disabled={busy} onClick={()=>void run(async()=>setNotice(downloadTeamCopyFile(preview)))}>下载桌面导入包</Button></article>}
 </>}
 {notice&&<p className="team-web-notice" role="status">{notice}</p>}{busy&&<p role="status">处理中…</p>}
 </main>
 <footer className="team-web-footer"><span>数据保存在公司团队服务；会话关闭后需重新登录。</span></footer>
 </div>;
}
