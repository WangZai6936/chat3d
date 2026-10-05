import {Button,Card,Badge} from '@radix-ui/themes';
import {useEffect,useState} from 'react';
import {CubeIcon,LayersIcon,ArrowRightIcon,ClockIcon} from '@radix-ui/react-icons';
import {switchSession,useWorkspaceStore} from '../workspace';
import {listModelAssets} from '../domain/modelAssetStorage';
import type {ModelAssetSummary} from '../domain/modelAssets';
import {projectLabel} from '../domain/libraryNavigation';
import {ProjectCreateForm,ProjectThumb} from './ProjectLibrary';
export function StudioHome({onOpen,onLibrary}:{onOpen:()=>void;onLibrary:(kind:'asset'|'scene')=>void}){
 const sessions=useWorkspaceStore(s=>s.sessions),[creating,setCreating]=useState<'asset'|'scene'>(),[items,setItems]=useState<ModelAssetSummary[]>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;listModelAssets().then(a=>{if(alive)setItems(a);}).catch(()=>{});return()=>{alive=false;};},[]);
 const recent=sessions.filter(s=>!s.deletedAt&&(s.moduleKind||s.snapshot.doc.nodes.length||s.snapshot.messages.length)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,6);
 return <main className="home-page"><header><span className="resource-eyebrow">你的创作空间</span><h1>欢迎回来</h1><p>从一个模型开始，搭建你的工业数字世界。</p></header><div className="home-create"><Button variant="soft" color="gray" onClick={()=>setCreating('asset')}><CubeIcon/><span><strong>新建资产</strong><small>创建独立模型，保存后重复使用</small></span><ArrowRightIcon/></Button><Button variant="soft" color="gray" onClick={()=>setCreating('scene')}><LayersIcon/><span><strong>新建场景</strong><small>引用资产，组合空间与布局</small></span><ArrowRightIcon/></Button></div>{creating&&<ProjectCreateForm kind={creating} onOpen={onOpen} onCancel={()=>setCreating(undefined)}/>}
 <div className="home-section-title"><h2><ClockIcon/>最近项目</h2><Button variant="soft" color="gray" onClick={()=>onLibrary('scene')}>查看场景库 <ArrowRightIcon/></Button></div>{error&&<p role="alert">{error}</p>}
 <div className="home-recent">{recent.map(s=><Card asChild key={s.id}><article><ProjectThumb src={s.sceneThumbnail??items.find(a=>a.id===s.assetSource?.id)?.thumbnail} name={s.title} kind={s.moduleKind??'scene'}/><Badge variant="soft" color="gray" className="home-kind">{s.moduleKind==='asset'?'资产':'场景'}</Badge><h3>{s.title}</h3><p>{s.snapshot.doc.nodes.length} 个零件 · {projectLabel(s)}</p><Button variant="soft" color="gray" onClick={()=>{if(switchSession(s.id))onOpen();else setError('请先结束当前执行任务或处理保存异常');}}>继续编辑 <ArrowRightIcon/></Button></article></Card>)}</div>{!recent.length&&<div className="resource-empty"><LayersIcon/><h2>开始你的第一个项目</h2><p>选择上方“新建资产”或“新建场景”。</p></div>}<footer className="resource-footer">当前浏览器保存 · 资产与场景独立管理 · 对话保留在对应项目中</footer></main>;
}
