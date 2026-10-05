import {AppearanceProvider,AppearanceMenu} from './ui/Appearance';
import {ProjectLibrary} from './ui/ProjectLibrary';
import {saveLibraryProject} from './domain/workspaceLibrary';
import {captureSoftware} from './scene/softwareCapture';
import {AssetLibrary} from './ui/AssetLibrary';
import {probeServerRenderer} from './scene/serverCapture';
import {importGlb} from './scene/importGlb';
import {WorkspaceTools} from './ui/WorkspaceTools';
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
import {Button,IconButton,Tooltip,Badge,DropdownMenu,Spinner} from '@radix-ui/themes';
import {HomeIcon,LayersIcon,ActivityLogIcon,ArrowLeftIcon,ChevronRightIcon,ChevronDownIcon,GearIcon,CubeIcon,UploadIcon,DownloadIcon,Cross1Icon,CounterClockwiseClockIcon,ReloadIcon,MixerHorizontalIcon,ChatBubbleIcon} from '@radix-ui/react-icons';
import '@radix-ui/themes/styles.css';
import './workspace.css';
import {TaskPanel} from './ui/TaskPanel';
import {SessionSidebar} from './ui/SessionSidebar';
import {Dialog} from '@radix-ui/themes';
import {StudioHome} from './ui/StudioHome';
import {TaskCenter,StudioSettings} from './ui/StudioPages';
import './studio-redesign.css';
import './ui-system.css';
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
  const modelFileRef=useRef<HTMLInputElement>(null);
  const [projectNotice, setProjectNotice] = useState('');
  const [modulePage,setModulePage]=useState<'home'|'workbench'|'asset'|'scene'|'tasks'|'settings'>('home');const [libraryRefresh,setLibraryRefresh]=useState(0);
  const [librarySaving,setLibrarySaving]=useState(false);const librarySaveRef=useRef(false);
  async function saveToLibrary(){if(librarySaveRef.current)return;librarySaveRef.current=true;setLibrarySaving(true);try{setProjectNotice(await saveLibraryProject(d=>captureSoftware(d,'perspective')));}catch(e){setProjectNotice(e instanceof Error?e.message:'保存失败');}finally{librarySaveRef.current=false;setLibrarySaving(false);}}
  const [exporting, setExporting] = useState(false);
  const downloadGlb = async () => {
    setExporting(true);
    try {
      const data = await exportGlb(structuredClone(useEditorStore.getState().doc));
      const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }));
      const a = document.createElement('a'); a.href = url; a.download = 'chat3d-model.glb';
      document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProjectNotice('已发起 GLB 下载：包含可见模型及材质，不包含背景、灯光、选中框或动画。保存动画与编辑工程请下载项目 JSON。');
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
  const [showTools,setShowTools]=useState(false);const [showHistory,setShowHistory]=useState(false);

  const workspace=useWorkspaceStore();
  const active=workspace.sessions.find(s=>s.id===workspace.activeId);
  const [showAssets,setShowAssets]=useState(false);
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [inspectorOpen,setInspectorOpen]=useState(true);
  const [assistantTab,setAssistantTab]=useState<'chat'|'tasks'>('chat');
  const [focusScene,setFocusScene]=useState(false);
  useEffect(()=>{void probeServerRenderer();void initializeWorkspace();},[]);
  useEffect(()=>{setAssistantTab('chat');},[workspace.activeId]);
  useEffect(()=>{setProjectNotice('');},[modulePage]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFocusScene(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(locked)setAssistantOpen(true);},[locked]);
  return <AppearanceProvider>
    <div className={`studio redesigned-studio ${modulePage==='workbench'?'editor-mode':'manager-mode'} ${focusScene?'focus-scene':''}`}>
      <nav className={`app-navigation ${modulePage==='workbench'?'compact':''}`} aria-label="主导航"><div className="app-brand"><CubeIcon/><strong>Chat3D</strong></div>{([['home','首页',HomeIcon],['asset','资产库',CubeIcon],['scene','场景库',LayersIcon],['workbench','建模工作台',MixerHorizontalIcon],['tasks','任务',ActivityLogIcon],['settings','设置',GearIcon]] as const).map(([page,label,Icon])=><Button variant="ghost" color="gray" key={page} title={label} aria-label={label} disabled={(locked&&page!=='workbench'&&page!=='tasks')||librarySaving||!workspace.ready} aria-current={modulePage===page?'page':undefined} onClick={()=>setModulePage(page)}><Icon/><span>{label}</span></Button>)}<div className="navigation-appearance"><AppearanceMenu/></div><p>当前浏览器保存</p></nav>
      <section className="studio-main">
        <header className="studio-header" hidden={modulePage!=='workbench'}>
          <Button variant="ghost" onClick={()=>setModulePage(active?.moduleKind==='asset'?'asset':'scene')} disabled={locked||librarySaving}><ArrowLeftIcon/>返回{active?.moduleKind==='asset'?'资产库':'场景库'}</Button>
          <div className="project-heading"><span>{active?.moduleKind==='asset'?'资产编辑':'场景编辑'} <ChevronRightIcon/></span><strong>{active?.title??'正在恢复工作台…'}</strong></div>
          <Badge color={workspace.error?'red':workspace.saving?'amber':'gray'} variant="soft" className="save-badge">{workspace.error?'保存异常':workspace.saving?'正在保存':'会话已自动保存到本浏览器'}</Badge>
          <span className="editor-save-state">{active?.snapshot.pendingBatch?'待确认':!active?.librarySavedAt?'草稿':active.savedRevision===useEditorStore.getState().doc.revision?'已保存到库':'未保存到库'}</span><div className="header-spacer"/><Button variant="ghost" color="gray" aria-pressed={focusScene} onClick={()=>setFocusScene(!focusScene)}>{focusScene?'恢复工作台':'专注场景'}</Button>
          <Button disabled={locked||librarySaving||!workspace.ready} onClick={()=>void saveToLibrary()}>{librarySaving?'正在保存…':active?.moduleKind==='asset'?'保存资产':'保存场景'}</Button>
          <Button aria-label="模型配置" variant="soft" color="gray" onClick={()=>setShowSettings(true)}><GearIcon/><span className="config-label">模型配置</span></Button>
          <DropdownMenu.Root><DropdownMenu.Trigger><Button variant="solid" disabled={locked||!workspace.ready}>导出与更多 <ChevronDownIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content>
            <DropdownMenu.Item onSelect={()=>setShowTools(true)}>工作台检查与备份</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={()=>fileRef.current?.click()}><UploadIcon/>导入项目到新会话</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={()=>modelFileRef.current?.click()}>导入网格模型 GLB（静态）</DropdownMenu.Item>
            <DropdownMenu.Label>保存工程：可重新打开编辑（JSON）</DropdownMenu.Label>
            <DropdownMenu.Item onSelect={saveProject}><DownloadIcon/>下载项目 JSON</DropdownMenu.Item>
            <DropdownMenu.Label>交付模型：供其他三维工具使用（GLB，无动画）</DropdownMenu.Label>
            <DropdownMenu.Item disabled={exporting||nodeCount===0} onSelect={()=>void downloadGlb()}><CubeIcon/>{exporting?'导出中…':'导出模型 GLB'}</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Root>
          <input ref={fileRef} type="file" accept=".json,.chat3d.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void openProject(file);}}/>
          <input ref={modelFileRef} type="file" accept=".glb" className="hidden" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GLB超过20MB');setProjectNotice('正在校验并导入网格模型…');const result=await importGlb(await file.arrayBuffer(),file.name);if(!createSession(result.doc))throw Error('请结束当前生成后再导入');setProjectNotice(`已导入 ${result.doc.nodes.length} 个网格部件到新会话。${result.warnings.join(' ')}`);}catch(error){setProjectNotice(`网格导入失败：${error instanceof Error?error.message:String(error)}`);}}}/>
        </header>
        {(workspace.error||autosaveError||projectNotice)&&<div role="status" className={`workspace-notice ${workspace.error||autosaveError?'is-error':''}`}><span>{workspace.error||autosaveError||projectNotice}</span>{!workspace.error&&!autosaveError&&<IconButton size="1" variant="ghost" color="gray" aria-label="关闭通知" onClick={()=>setProjectNotice('')}><Cross1Icon/></IconButton>}</div>}
        {!workspace.ready&&<div className="workspace-loading"><Spinner size="3"/><p>正在恢复项目…</p></div>}
        {workspace.ready&&modulePage==='home'&&<StudioHome onOpen={()=>{setModulePage('workbench');setAssistantOpen(useEditorStore.getState().doc.nodes.length===0);}} onLibrary={setModulePage}/>}
        {workspace.ready&&(modulePage==='asset'||modulePage==='scene')&&<ProjectLibrary key={modulePage+libraryRefresh} kind={modulePage} onOpen={()=>{setModulePage('workbench');setAssistantOpen(useEditorStore.getState().doc.nodes.length===0);}} onManage={()=>setShowAssets(true)}/>}
        {workspace.ready&&modulePage==='tasks'&&<TaskCenter locked={locked} onOpen={()=>{setModulePage('workbench');setAssistantOpen(true);setAssistantTab('chat');}}/>}
        {workspace.ready&&modulePage==='settings'&&<StudioSettings onModel={()=>setShowSettings(true)} onBackup={()=>setShowTools(true)} onAssets={()=>setShowAssets(true)} onHistory={()=>setShowHistory(true)}/>}
        {workspace.ready&&<div className={`editor-workspace ${assistantOpen?'assistant-expanded':''}`} hidden={modulePage!=='workbench'}>
        <div className="editor-upper"><aside className="editor-objects"><div className="editor-panel-heading">场景结构</div><Button disabled={locked} variant="soft" onClick={()=>setShowAssets(true)}>引用资产</Button><ObjectTree/></aside>
          <main className="scene-region">
            <div className="scene-toolbar"><div className="scene-title"><CubeIcon/><strong>三维场景</strong><Badge variant="soft" color="gray">{nodeCount} 个对象</Badge>{previewing&&<Badge color="green">待确认预览</Badge>}</div><div className="scene-actions"><Tooltip content="撤销"><IconButton variant="ghost" color="gray" disabled={!canUndo||locked} onClick={undo} aria-label="撤销"><CounterClockwiseClockIcon/></IconButton></Tooltip><Tooltip content="重做"><IconButton variant="ghost" color="gray" disabled={!canRedo||locked} onClick={redo} aria-label="重做"><ReloadIcon/></IconButton></Tooltip><span className="toolbar-separator"/><Button variant={inspectorOpen?'soft':'ghost'} color="gray" aria-expanded={inspectorOpen&&!assistantOpen} onClick={()=>{if(assistantOpen){setAssistantOpen(false);setInspectorOpen(true);}else setInspectorOpen(!inspectorOpen);}}><MixerHorizontalIcon/>对象与属性</Button></div></div>
            <div className="scene-stage"><ViewportPanel/></div>
            <footer className="scene-footer"><span><span className="status-dot"/>{previewing?'预览尚未提交':locked?'正在处理草稿':'可编辑场景'}</span><span>单位 m · Y 轴向上</span><span>{dirty?'当前修改尚未导出备份':'项目文件无待导出修改'}</span></footer>
          </main>
          {inspectorOpen&&<aside className="editor-properties"><div className="editor-panel-heading">对象属性<IconButton size="1" variant="ghost" aria-label="关闭属性面板" onClick={()=>setInspectorOpen(false)}><Cross1Icon/></IconButton></div><PropertiesPanel/></aside>}
        </div><div className="assistant-dock-bar"><button aria-expanded={assistantOpen} onClick={()=>setAssistantOpen(!assistantOpen)}><ChatBubbleIcon/>AI 助手 · {assistantOpen?'收起对话':'描述修改，开始建模'}</button><span>{previewing?'修改已生成，待确认':locked?'正在执行':nodeCount+' 个零件'}</span><button onClick={()=>{setModulePage('tasks');}}>查看任务</button></div>
          <aside className="conversation-region" hidden={!assistantOpen}><div className="conversation-heading"><div className="assistant-tabs" role="tablist" aria-label="助手工作区" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'chat':e.key==='End'?'tasks':assistantTab==='chat'?'tasks':'chat';setAssistantTab(next);document.getElementById(next==='chat'?'chat-tab':'task-tab')?.focus();}}}><button role="tab" id="chat-tab" tabIndex={assistantTab==='chat'?0:-1} aria-controls="chat-content" aria-selected={assistantTab==='chat'} onClick={()=>setAssistantTab('chat')}><ChatBubbleIcon/>对话</button><button role="tab" id="task-tab" tabIndex={assistantTab==='tasks'?0:-1} aria-controls="task-content" aria-selected={assistantTab==='tasks'} onClick={()=>setAssistantTab('tasks')}>任务记录{locked&&<span className="tab-activity"/>}</button></div><Badge color="gray" variant="soft">{!aiConfig||aiConfig.useMock?'未连接模型':aiConfig?.agentMode==='single'?'单次生成':'Pi Agent'}</Badge></div><div role="tabpanel" id="chat-content" aria-labelledby="chat-tab" hidden={assistantTab!=='chat'} className="assistant-content"><ChatPanel key={workspace.activeId} executionDetails={false} onAssets={()=>setShowAssets(true)} onConfigure={()=>setShowSettings(true)}/></div><div role="tabpanel" id="task-content" aria-labelledby="task-tab" hidden={assistantTab!=='tasks'} className="assistant-content"><TaskPanel onConversation={()=>setAssistantTab('chat')}/></div></aside>
        </div>}
      </section>
      {showAssets&&<AssetLibrary intent={modulePage==='workbench'?'insert':'manage'} targetName={active?.title} onClose={()=>{setShowAssets(false);setLibraryRefresh(v=>v+1);}}/>}
      {showHistory&&<Dialog.Root open onOpenChange={setShowHistory}><Dialog.Content style={{maxWidth:430}}><Dialog.Title>旧项目与回收站</Dialog.Title><Dialog.Description>历史项目仍保留，可重命名、恢复或继续编辑。</Dialog.Description><div className="history-management"><SessionSidebar locked={locked} onClose={()=>{setShowHistory(false);setModulePage('workbench');}}/></div><Button onClick={()=>{setShowHistory(false);setModulePage('workbench');}}>进入选中项目</Button></Dialog.Content></Dialog.Root>}
      {showTools&&<WorkspaceTools onClose={()=>setShowTools(false)}/>}
      {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)}/>}
    </div>
  </AppearanceProvider>;
}
