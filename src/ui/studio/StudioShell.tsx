import {Fragment,type ReactNode} from 'react';
import {Button} from '@radix-ui/themes';
import {GearIcon,HomeIcon,CubeIcon,LayersIcon,PersonIcon,CursorArrowIcon,RowsIcon,ChevronRightIcon,ClockIcon} from '@radix-ui/react-icons';
import {BrandMark} from '../BrandMark';
import {AppearanceMenu} from '../Appearance';
import {AppUpdateNavEntry} from '../AppUpdateNotice';
import {TaskQueue} from '../TaskQueue';

export type StudioNavPage = 'home' | 'workbench' | 'asset' | 'scene' | 'team' | 'tasks' | 'settings';
const NAV_ITEMS=[
  {page:'home',label:'创作首页',accessibleLabel:'首页',icon:HomeIcon},
  {page:'workbench',label:'建模工作台',accessibleLabel:'建模工作台',icon:CursorArrowIcon},
  {page:'asset',label:'资产库',accessibleLabel:'资产库',icon:CubeIcon,section:'资源'},
  {page:'scene',label:'场景库',accessibleLabel:'场景库',icon:LayersIcon},
  {page:'team',label:'团队资源',accessibleLabel:'团队库',icon:PersonIcon},
] as const;
const PAGE_LABELS:Record<StudioNavPage,string>={home:'创作首页',asset:'资产库',scene:'场景库',workbench:'建模工作台',team:'团队资源',tasks:'任务记录',settings:'设置'};
export function StudioShell({activePage,onNavigate,disabled,taskQueueRequest,onTaskOpen,onTaskHistory}:{activePage:StudioNavPage;onNavigate:(page:StudioNavPage)=>void;disabled:boolean;taskQueueRequest:number;onTaskOpen:()=>void;onTaskHistory:()=>void}){
 return <>
  <nav className="app-navigation studio-shell" aria-label="主导航" hidden={activePage==='workbench'}>
   <div className="app-brand studio-shell-brand"><BrandMark/><div><strong>Scenivo</strong><small>三维创作工作空间</small></div></div>
   <div className="studio-navigation-caption">创作</div>
   <div className="navigation-pages studio-shell-nav" role="navigation" aria-label="工作室页面">
    {NAV_ITEMS.map(item=>{const {page,label,accessibleLabel,icon:Icon}=item;return <Fragment key={page}>{'section' in item&&<div className="studio-navigation-caption">{item.section}</div>}<Button variant="ghost" color="gray" className="studio-nav-item" title={label} aria-label={accessibleLabel} disabled={disabled} aria-current={activePage===page?'page':undefined} onClick={()=>onNavigate(page)}><Icon/><span>{label}</span></Button></Fragment>;})}
   </div>
   <div className="studio-navigation-caption">管理</div>
   <div className="navigation-pages studio-shell-nav studio-management-nav">
    <Button variant="ghost" color="gray" className="studio-nav-item" aria-label="任务记录" disabled={disabled} aria-current={activePage==='tasks'?'page':undefined} onClick={onTaskHistory}><ClockIcon/><span>任务记录</span></Button>
    <Button variant="ghost" color="gray" className="studio-nav-item" aria-label="设置" disabled={disabled} aria-current={activePage==='settings'?'page':undefined} onClick={()=>onNavigate('settings')}><GearIcon/><span>设置</span></Button>
   </div>
   <div className="studio-sidebar-footer"><AppUpdateNavEntry disabled={disabled} layout="sidebar"/><div className="studio-local-note"><div><strong>本地工作空间</strong><small>数据保存在当前设备</small></div></div></div>
  </nav>
  <header className={`studio-global-header ${activePage==='workbench'?'workbench-global-header':''}`}>
   {activePage!=='workbench'&&<div className="studio-breadcrumb"><RowsIcon/><span/>工作空间<ChevronRightIcon/><strong>{PAGE_LABELS[activePage]}</strong></div>}
   <div className="studio-global-utilities"><TaskQueue openRequest={taskQueueRequest} disabled={disabled} onOpen={onTaskOpen} onHistory={onTaskHistory}/><AppearanceMenu/></div>
  </header>
 </>;
}
export function StudioMain({children}:{children:ReactNode}){
 return <section className="studio-main studio-shell-main">{children}</section>;
}
