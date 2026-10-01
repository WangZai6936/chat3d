// 应用外壳（方案第 2 节四区布局）：顶部工具栏 + 左对象树/属性 + 中视口 + 右对话
// React 只画壳子与列表类 UI；Three.js 视口保持命令式（决策 #1）
// 对话区放右侧整高：消息上下文完整可见（早期版本放底部，只能看到一两行）
// 工具栏「模型配置」打开 SettingsDialog：baseURL/apiKey/model 存本机，对话生成走真实 API
import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './ui/ChatPanel';
import { SettingsDialog } from './ui/SettingsDialog';
import {modelingModule} from './modules/modeling';
const ViewportPanel=modelingModule.Viewport;
const ObjectTree=modelingModule.Objects;
const PropertiesPanel=modelingModule.Properties;
import { useEditorStore, useDisplayDoc } from './store';
import { exportGlb } from './scene/export';
import {Theme,Button,IconButton,Tooltip,Badge,DropdownMenu,Tabs,Spinner} from '@radix-ui/themes';
import {HamburgerMenuIcon,ChevronRightIcon,ChevronDownIcon,GearIcon,CubeIcon,UploadIcon,DownloadIcon,Cross1Icon,CounterClockwiseClockIcon,ReloadIcon,MixerHorizontalIcon,ChatBubbleIcon} from '@radix-ui/react-icons';
import '@radix-ui/themes/styles.css';
import './workspace.css';
import {TaskPanel} from './ui/TaskPanel';
import {SessionSidebar} from './ui/SessionSidebar';
import {initializeWorkspace,useWorkspaceStore,createSession} from './workspace';
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from './domain/project';

export default function App() {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const dirty = useEditorStore((s) => s.dirty);
  const aiConfig = useEditorStore((s) => s.aiConfig);
  const nodeCount = useDisplayDoc().nodes.length;
  const aiStatus = useEditorStore((s) => s.aiStatus);
  const previewing = aiStatus === 'previewing';
  const locked = ['capturing', 'context', 'generating', 'validating', 'previewing', 'applying'].includes(aiStatus);
  const autosaveError = useEditorStore((s) => s.autosaveError);
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectNotice, setProjectNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const downloadGlb = async () => {
    setExporting(true);
    try {
      const data = await exportGlb(structuredClone(useEditorStore.getState().doc));
      const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }));
      const a = document.createElement('a'); a.href = url; a.download = 'chat3d-model.glb';
      document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProjectNotice('已发起 GLB 下载：包含可见模型及材质，不包含背景、灯光和选中框。编辑工程请另行下载项目。');
    } catch (e) { setProjectNotice(`GLB 导出失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setExporting(false); }
  };
  const saveProject = () => {
    try {
      const doc = useEditorStore.getState().doc;
      const url = URL.createObjectURL(new Blob([serializeProject(doc)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `chat3d-${doc.projectId.slice(0, 8)}.chat3d.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      useEditorStore.getState().markSaved();
      setProjectNotice('已发起项目下载，请确认文件已保存在电脑上；模型密钥不会写入项目。');
    } catch (e) { setProjectNotice(`项目下载失败：${e instanceof Error ? e.message : String(e)}`); }
  };
  const openProject = async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('项目文件超过 20 MB');
      const doc = parseProject(await file.text());
      if (!createSession(doc)) throw new Error('请先完成当前操作，或检查会话存储状态');
      setProjectNotice(`已导入新会话，共 ${doc.nodes.length} 个对象`);
    } catch (e) { setProjectNotice(`打开失败：${e instanceof Error ? e.message : String(e)}`); }
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useWorkspaceStore.getState().saving || !!useWorkspaceStore.getState().error || ['capturing','context','generating','validating','previewing'].includes(useEditorStore.getState().aiStatus)) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const [showSettings, setShowSettings] = useState(false);

  const workspace=useWorkspaceStore();
  const active=workspace.sessions.find(s=>s.id===workspace.activeId);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [inspectorOpen,setInspectorOpen]=useState(false);
  const [assistantTab,setAssistantTab]=useState<'chat'|'tasks'>('chat');
  const [focusScene,setFocusScene]=useState(false);
  useEffect(()=>{void initializeWorkspace();},[]);
  useEffect(()=>{setAssistantTab('chat');},[workspace.activeId]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSidebarOpen(false);setFocusScene(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  return <Theme appearance="dark" accentColor="blue" grayColor="slate" radius="large">
    <div className={`studio ${focusScene?'focus-scene':''}`}>
      <aside className={`session-sidebar ${sidebarOpen?'is-open':''}`}><SessionSidebar locked={locked} onClose={()=>setSidebarOpen(false)}/></aside>
      {sidebarOpen&&<button className="sidebar-scrim" aria-label="关闭侧栏" onClick={()=>setSidebarOpen(false)}/>}
      <section className="studio-main">
        <header className="studio-header">
          <IconButton variant="ghost" color="gray" className="sidebar-toggle" aria-label="显示会话列表" onClick={()=>setSidebarOpen(true)}><HamburgerMenuIcon/></IconButton>
          <div className="project-heading"><span>建模工作台 <ChevronRightIcon/></span><strong>{active?.title??'正在恢复工作台…'}</strong></div>
          <Badge color={workspace.error?'red':workspace.saving?'amber':'gray'} variant="soft" className="save-badge">{workspace.error?'保存异常':workspace.saving?'正在保存':'本地已保存'}</Badge>
          <div className="header-spacer"/><Button variant="ghost" color="gray" aria-pressed={focusScene} onClick={()=>setFocusScene(!focusScene)}>{focusScene?'恢复工作台':'专注场景'}</Button>
          <Button variant="soft" color="gray" onClick={()=>setShowSettings(true)}><GearIcon/><span className="config-label">模型配置</span></Button>
          <DropdownMenu.Root><DropdownMenu.Trigger><Button variant="solid" disabled={locked||!workspace.ready}>项目 <ChevronDownIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content>
            <DropdownMenu.Item onSelect={()=>fileRef.current?.click()}><UploadIcon/>导入项目到新会话</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={saveProject}><DownloadIcon/>下载项目 JSON</DropdownMenu.Item>
            <DropdownMenu.Item disabled={exporting||nodeCount===0} onSelect={()=>void downloadGlb()}><CubeIcon/>{exporting?'导出中…':'导出模型 GLB'}</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Root>
          <input ref={fileRef} type="file" accept=".json,.chat3d.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void openProject(file);}}/>
        </header>
        {(workspace.error||autosaveError||projectNotice)&&<div role="status" className={`workspace-notice ${workspace.error||autosaveError?'is-error':''}`}><span>{workspace.error||autosaveError||projectNotice}</span>{!workspace.error&&!autosaveError&&<IconButton size="1" variant="ghost" color="gray" aria-label="关闭通知" onClick={()=>setProjectNotice('')}><Cross1Icon/></IconButton>}</div>}
        {!workspace.ready?<div className="workspace-loading"><Spinner size="3"/><p>正在恢复会话与项目…</p></div>:<div className="studio-content">
          <main className="scene-region">
            <div className="scene-toolbar"><div className="scene-title"><CubeIcon/><strong>三维场景</strong><Badge variant="soft" color="gray">{nodeCount} 个对象</Badge>{previewing&&<Badge color="green">待确认预览</Badge>}</div><div className="scene-actions"><Tooltip content="撤销"><IconButton variant="ghost" color="gray" disabled={!canUndo||locked} onClick={undo} aria-label="撤销"><CounterClockwiseClockIcon/></IconButton></Tooltip><Tooltip content="重做"><IconButton variant="ghost" color="gray" disabled={!canRedo||locked} onClick={redo} aria-label="重做"><ReloadIcon/></IconButton></Tooltip><span className="toolbar-separator"/><Button variant={inspectorOpen?'soft':'ghost'} color="gray" aria-expanded={inspectorOpen} onClick={()=>setInspectorOpen(!inspectorOpen)}><MixerHorizontalIcon/>对象与属性</Button></div></div>
            <div className={`scene-stage ${inspectorOpen?'with-inspector':''}`}><ViewportPanel/>{inspectorOpen&&<aside className="inspector-panel"><Tabs.Root defaultValue="objects"><Tabs.List><Tabs.Trigger value="objects">对象列表</Tabs.Trigger><Tabs.Trigger value="properties">选中属性</Tabs.Trigger></Tabs.List><Tabs.Content value="objects"><ObjectTree/></Tabs.Content><Tabs.Content value="properties"><PropertiesPanel/></Tabs.Content></Tabs.Root><IconButton className="inspector-close" size="1" variant="ghost" color="gray" aria-label="关闭属性面板" onClick={()=>setInspectorOpen(false)}><Cross1Icon/></IconButton></aside>}</div>
            <footer className="scene-footer"><span><span className="status-dot"/>{previewing?'预览尚未提交':locked?'正在处理草稿':'可编辑场景'}</span><span>单位 m · Y 轴向上</span><span>{dirty?'项目有修改':'项目已就绪'}</span></footer>
          </main>
          <aside className="conversation-region"><div className="conversation-heading"><div className="assistant-tabs" role="tablist" aria-label="助手工作区" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'chat':e.key==='End'?'tasks':assistantTab==='chat'?'tasks':'chat';setAssistantTab(next);document.getElementById(next==='chat'?'chat-tab':'task-tab')?.focus();}}}><button role="tab" id="chat-tab" tabIndex={assistantTab==='chat'?0:-1} aria-controls="chat-content" aria-selected={assistantTab==='chat'} onClick={()=>setAssistantTab('chat')}><ChatBubbleIcon/>对话</button><button role="tab" id="task-tab" tabIndex={assistantTab==='tasks'?0:-1} aria-controls="task-content" aria-selected={assistantTab==='tasks'} onClick={()=>setAssistantTab('tasks')}>任务记录{locked&&<span className="tab-activity"/>}</button></div><Badge color={aiConfig?.useMock?'amber':'gray'} variant="soft">{aiConfig?.useMock?'演示':aiConfig?.agentMode==='single'?'单次生成':'Pi Agent'}</Badge></div><div role="tabpanel" id="chat-content" aria-labelledby="chat-tab" hidden={assistantTab!=='chat'} className="assistant-content"><ChatPanel key={workspace.activeId} executionDetails={false}/></div><div role="tabpanel" id="task-content" aria-labelledby="task-tab" hidden={assistantTab!=='tasks'} className="assistant-content"><TaskPanel onConversation={()=>setAssistantTab('chat')}/></div></aside>
        </div>}
      </section>
      {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)}/>}
    </div>
  </Theme>;
}
