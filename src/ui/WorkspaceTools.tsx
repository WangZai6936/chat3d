import {useRef,useState} from 'react';
import {Dialog,Button} from '@radix-ui/themes';
import {useEditorStore,useDisplayDoc} from '../store';
import {exportWorkspaceBackup,importWorkspaceBackup} from '../workspace';
import {inspectSceneQuality} from '../domain/sceneQuality';
export function WorkspaceTools({onClose}:{onClose:()=>void}){
 const [notice,setNotice]=useState('');const input=useRef<HTMLInputElement>(null);const doc=useDisplayDoc();const status=useEditorStore(s=>s.viewportStatus);const cfg=useEditorStore(s=>s.aiConfig);const [report,setReport]=useState<ReturnType<typeof inspectSceneQuality>|null>(null);
 const download=()=>{try{const blob=new Blob([exportWorkspaceBackup()],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='chat3d-workspace.backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('备份已发起下载，请确认文件落盘。含聊天文字与草稿，不含模型配置、密钥和参考图片。');}catch(e){setNotice(String(e));}};
 return <Dialog.Root open onOpenChange={v=>!v&&onClose()}><Dialog.Content maxWidth="680px"><Dialog.Title>工作台检查与备份</Dialog.Title><Dialog.Description>先检查运行环境，再导出可迁移副本。恢复以新增会话方式导入，不覆盖现有项目。</Dialog.Description>
 <div className="space-y-4 mt-4"><section><h3>运行状态</h3><p>三维：{status==='ready'?'已就绪':status==='error'?'不可用，不能完成视觉验收':'正在启动'} · 模型：{cfg?'已配置（不代表连接已验证）':'未配置'}</p><p>场景 {doc.nodes.length} 个零件 · 动画 {doc.animation?.tracks.length??0} 条轨道</p><p>三维不可用时可以编辑与备份，但请在支持 WebGL 的浏览器检查真实画面。请勿为了运行应用关闭浏览器安全保护。</p></section>
 <section><h3>场景检查</h3><Button onClick={()=>setReport(inspectSceneQuality(doc))}>检查当前场景</Button>{report&&<div role="status"><p>检查版本 {report.revision}，{report.componentCount} 个组件{report.revision!==doc.revision?'（结果已过期，请重新检查）':''}</p><ul>{report.issues.map((s,i)=><li key={i}>{s}</li>)}</ul><p>{report.issues.length?'这些是待核对线索':'未发现已覆盖规则的问题'}；不代表工艺、碰撞或视觉验收通过。</p></div>}</section>
 <section><h3>备份与迁移</h3><p>保存所有未删除会话的项目、动画、聊天文字和输入草稿。未确认模型另存为草稿副本；不包含参考图、撤销历史及模型密钥。迁移后需重新配置模型。</p><div className="flex gap-2"><Button onClick={download}>下载工作台备份</Button><Button variant="soft" onClick={()=>input.current?.click()}>导入备份为新会话</Button></div><input ref={input} type="file" accept=".json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.size>50*1024*1024)throw Error('文件超过50MB');const count=importWorkspaceBackup(await f.text());setNotice(`已新增 ${count} 个会话，原会话未覆盖`);}catch(error){setNotice(String(error));}}}/></section>
 <section><h3>使用与验收</h3><ol><li>复杂建模使用真实模型；明确的单项改色、改名、移动和单零件尺寸修改会优先本地校验，0 Token，仍先预览。</li><li>目标重名、含图片、复合或模糊指令仍交给模型，不猜测修改对象。</li><li>动画是可编辑演示，不是物理仿真；路线不自动避障。</li><li>每轮检查变化范围、尺寸及未验证事项，确认后再应用。项目 JSON 含动画，GLB 仅静态模型。</li><li>更新页面前先备份并结束生成。部署更新不会自动更新已下载的桌面安装包。</li></ol></section>
 {notice&&<p role="status">{notice}</p>}<Button onClick={onClose}>关闭</Button></div></Dialog.Content></Dialog.Root>;
}
