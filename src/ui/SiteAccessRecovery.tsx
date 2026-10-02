import {useEditorStore} from '../store';
import {serializeProject} from '../domain/project';
export function SiteAccessRecovery({error}:{error?:string|null}){
 if(!error||!/体验页访问验证未通过/.test(error)||typeof location==='undefined'||!location.hostname.endsWith('.chatgpt.site'))return null;
 const backup=()=>{const s=useEditorStore.getState();const doc=s.pendingResult?.doc??s.doc;const url=URL.createObjectURL(new Blob([serializeProject(doc)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='chat3d-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section aria-label="恢复体验页访问" className="my-2 rounded border border-amber-300/30 bg-amber-950/20 p-3 text-sm text-amber-100">
  <p>体验页要求重新登录，模型配置无需重填。当前页面和草稿会保留。</p>
  <div className="mt-2 flex flex-wrap gap-3"><button className="underline" onClick={backup}>下载当前场景备份</button><a className="underline" href={new URL('/signin-with-chatgpt',location.origin).href} target="_blank" rel="noopener noreferrer">重新登录体验页</a></div>
  <p className="mt-2 text-xs opacity-80">登录在新标签页打开，不会自动重发模型请求或额外生成。完成后回到本页，恢复失败指令再发送。若新标签页没有当前场景，可导入备份。</p>
 </section>;
}
