import {useEffect,useState,useSyncExternalStore} from 'react';
import {Button,Dialog,DropdownMenu} from '@radix-ui/themes';
import {ArrowRightIcon,ChevronUpIcon,Cross1Icon,ExitIcon,LockClosedIcon,PersonIcon} from '@radix-ui/react-icons';
import {getTeamSession,getTeamSessionStatus,logoutTeamSession,subscribeTeamSession} from '../../domain/teamLibrary';
import {TeamSessionLogin} from '../TeamTransferDialog';

export function StudioAccount({disabled,loginOpen,onLoginOpenChange,onTeam}:{disabled:boolean;loginOpen:boolean;onLoginOpenChange:(open:boolean)=>void;onTeam:()=>void}){
 const client=useSyncExternalStore(subscribeTeamSession,getTeamSession,getTeamSession);
 const sessionStatus=useSyncExternalStore(subscribeTeamSession,getTeamSessionStatus,getTeamSessionStatus);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const user=client?.user;
 const role=user?.role==='admin'?'团队管理员':user?.role==='viewer'?'只读成员':'团队成员';
 useEffect(()=>{if(user)setError('');},[user]);
 async function signOut(){setBusy(true);setError('');try{await logoutTeamSession();}catch{if(!getTeamSession()?.user)setError('已退出本机账户，服务端注销暂未完成。');}finally{setBusy(false);}}
 const identity=<><span className={`studio-account-avatar${user?' is-connected':''}`} aria-hidden="true">{user?Array.from(user.name.trim())[0]||<PersonIcon/>:<PersonIcon/>}</span><span className="studio-account-copy"><strong>{user?.name||(sessionStatus==='restoring'?'正在恢复账户':sessionStatus==='expired'?'登录已过期':'登录账户')}</strong><small>{user?`${role} · 已登录`:'访问团队资源'}</small></span>{user?<ChevronUpIcon className="studio-account-chevron"/>:<ArrowRightIcon className="studio-account-chevron"/>}</>;
 return <>
  {user?<DropdownMenu.Root><DropdownMenu.Trigger><Button className="studio-account-trigger" variant="ghost" color="gray" disabled={disabled||busy} aria-label={`账户菜单：${user.name}`}>{identity}</Button></DropdownMenu.Trigger><DropdownMenu.Content className="studio-account-menu" align="start" side="top" sideOffset={10}><DropdownMenu.Label>{user.name} · {role}</DropdownMenu.Label><DropdownMenu.Item onSelect={onTeam}><PersonIcon/>查看团队资源</DropdownMenu.Item><DropdownMenu.Separator/><DropdownMenu.Item disabled={busy} onSelect={()=>void signOut()}><ExitIcon/>退出登录</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root>:<Button className="studio-account-trigger" variant="ghost" color="gray" disabled={disabled||busy} aria-label="登录账户" onClick={()=>{setError('');onLoginOpenChange(true);}}>{identity}</Button>}
  {error&&<p className="studio-account-error" role="alert">{error}</p>}
  <Dialog.Root open={loginOpen&&!user} onOpenChange={onLoginOpenChange}><Dialog.Content className="studio-login-dialog" maxWidth="440px"><div className="studio-login-heading"><span className="studio-login-symbol" aria-hidden="true"><LockClosedIcon/></span><Dialog.Close><Button variant="ghost" color="gray" aria-label="关闭账户登录"><Cross1Icon/></Button></Dialog.Close></div><Dialog.Title>登录，连接你的团队</Dialog.Title><Dialog.Description>访问所属团队的资产与场景，让创作成果与同事共享。</Dialog.Description>{sessionStatus==='expired'&&<p className="studio-login-expired" role="status">团队登录已过期，请重新授权。本地项目与未发送内容均已保留。</p>}<TeamSessionLogin/><p className="studio-login-scope">账户登录用于访问团队资源。AI 模型服务在「设置 → 模型与执行」中单独配置。</p><div className="studio-login-local"><strong>本地创作始终可用</strong><p>无需登录即可创建、编辑和保存本地项目。登录不会自动上传你的内容。</p><Dialog.Close><Button variant="ghost" color="gray">继续使用本地资源<ArrowRightIcon/></Button></Dialog.Close></div></Dialog.Content></Dialog.Root>
 </>;
}
