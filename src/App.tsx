import {SaveToast,isLibrarySaveNotice} from './ui/SaveToast';
import {TaskQueue} from './ui/TaskQueue';
import {BrandMark} from './ui/BrandMark';
import {useSelectionTool} from './ui/selectionTool';
import {DeleteSelectionAction} from './ui/DeleteSelectionAction';
import {ToolbarAction} from './ui/ToolbarAction';
import {makeId} from './util/ids';
import {ConversationResize,useConversationWidth} from './ui/ConversationResize';
import type {CSSProperties} from 'react';
import {Button as HeroButton} from '@heroui/react';
import {CanvasAssetShelf,CanvasInspector,CanvasSelectionSummary,type CanvasPropertyTab} from './ui/CanvasPanels';
import {focusSceneObjects} from './scene/focus';
import {CursorArrowIcon,MoveIcon,RotateCounterClockwiseIcon,SizeIcon,EnterFullScreenIcon} from '@radix-ui/react-icons';
import {AppearanceProvider,AppearanceMenu} from './ui/Appearance';
import {ProjectLibrary} from './ui/ProjectLibrary';
import {LibraryProjectSaveDialog} from './ui/LibraryMetadataDialog';
import {AssetLibrary} from './ui/AssetLibrary';
import {probeServerRenderer} from './scene/serverCapture';
import {importGlb} from './scene/importGlb';
import {WorkspaceTools} from './ui/WorkspaceTools';
// 应用外壳（方案第 2 节四区布局）：顶部工具栏 + 左对象树/属性 + 中视口 + 右对话
// React 只画壳子与列表类 UI；Three.js 视口保持命令式（决策 #1）
// 对话区放右侧整高：消息上下文完整可见（早期版本放底部，只能看到一两行）
// 工具栏「模型配置」打开 SettingsDialog：baseURL/apiKey/model 存本机，对话生成走真实 API
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatPanel } from './ui/ChatPanel';
import { SettingsDialog } from './ui/SettingsDialog';
import {modelingModule} from './modules/modeling';
const ViewportPanel=modelingModule.Viewport;
const ObjectTree=modelingModule.Objects;
const PropertiesPanel=modelingModule.Properties;
import { useEditorStore, useDisplayDoc } from './store';
import { exportGlb } from './scene/export';
import {Button,IconButton,Badge,DropdownMenu,Popover,Spinner} from '@radix-ui/themes';
import {LayersIcon,ChevronDownIcon,GearIcon,CubeIcon,UploadIcon,DownloadIcon,Cross1Icon,CounterClockwiseClockIcon,ReloadIcon,MixerHorizontalIcon,ChatBubbleIcon} from '@radix-ui/react-icons';
import '@radix-ui/themes/styles.css';
import './workspace.css';
import {TaskPanel} from './ui/TaskPanel';
import {SessionSidebar} from './ui/SessionSidebar';
import {Dialog} from '@radix-ui/themes';
import {StudioHome} from './ui/StudioHome';
import {TaskCenter,StudioSettings} from './ui/StudioPages';
import './studio-redesign.css';
import './ui-system.css';
import './canvas-studio.css';
import './canvas-conversation.css';
import './option2.css';
import './frosted-studio.css';
import './creative-gallery.css';
import './studio-control-polish.css';
import './graphite-controls.css';
import './workbench-footer.css';
import './thumbnail-layout.css';
import './home-command-center.css';
import {initializeWorkspace,useWorkspaceStore,createSession,anySessionRunning} from './workspace';
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from './domain/project';

export default function App() {
  const [taskQueueRequest,setTaskQueueRequest]=useState(0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const dirty = useEditorStore((s) => s.dirty);
  const nodeCount = useDisplayDoc().nodes.length;
  const aiStatus = useEditorStore((s) => s.aiStatus);
  const previewing = aiStatus === 'previewing';
  const locked = ['capturing', 'context', 'generating', 'validating', 'previewing', 'applying'].includes(aiStatus);
  const autosaveError = useEditorStore((s) => s.autosaveError);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelFileRef=useRef<HTMLInputElement>(null);
  const [projectNotice, setProjectNotice] = useState('');
  const closeSaveNotice=useCallback(()=>setProjectNotice(''),[]);
  const saveNotice=isLibrarySaveNotice(projectNotice)&&!autosaveError;
  const [modulePage,setModulePage]=useState<'home'|'workbench'|'asset'|'scene'|'tasks'|'settings'>('home');const [libraryRefresh,setLibraryRefresh]=useState(0);
  const [librarySaving,setLibrarySaving]=useState(false),[showLibrarySave,setShowLibrarySave]=useState(false);

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
      if (anySessionRunning() || useWorkspaceStore.getState().saving || !!useWorkspaceStore.getState().error || ['capturing','context','generating','validating','previewing'].includes(useEditorStore.getState().aiStatus)) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const [autoStartRequest,setAutoStartRequest]=useState<{id:string;projectId:string}|null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTools,setShowTools]=useState(false);const [showHistory,setShowHistory]=useState(false);

  const workspace=useWorkspaceStore();
  const active=workspace.sessions.find(s=>s.id===workspace.activeId);
  const [showAssets,setShowAssets]=useState(false);
  const [assistantOpen,setAssistantOpen]=useState(true);
  const [assistantWidth,setAssistantWidth]=useConversationWidth();
  const [inspectorOpen,setInspectorOpen]=useState(false);
  const [structureOpen,setStructureOpen]=useState(false),[shelfOpen,setShelfOpen]=useState(false),[advancedOpen,setAdvancedOpen]=useState(false);
  const [propertyTab,setPropertyTab]=useState<CanvasPropertyTab>('position');
  const selectionBox=useSelectionTool(s=>s.box),wholeModelBox=useSelectionTool(s=>s.wholeModel),throughBox=useSelectionTool(s=>s.through);
  const selection=useEditorStore(s=>s.selection);const viewportReady=useEditorStore(s=>s.viewportStatus==='ready');
  function openInspector(){setInspectorOpen(true);setShelfOpen(false);setStructureOpen(false);}
  useEffect(()=>{!selection.length&&setInspectorOpen(false)},[selection.join('|')]);
  const [assistantTab,setAssistantTab]=useState<'chat'|'tasks'>('chat');
  const [focusScene,setFocusScene]=useState(false);
  useEffect(()=>{void probeServerRenderer();void initializeWorkspace();},[]);
  useEffect(()=>{setAssistantTab('chat');},[workspace.activeId]);
  useEffect(()=>{setProjectNotice('');},[modulePage]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFocusScene(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(locked)setAssistantOpen(true);},[locked]);

  return <AppearanceProvider>
    <div style={{'--chat-width':`${assistantWidth}px`,'--chat-space':assistantOpen?`${assistantWidth}px`:'0px'} as CSSProperties} className={`studio redesigned-studio canvas-studio frosted-studio ${modulePage==='workbench'?'editor-mode':'manager-mode'} ${focusScene?'focus-scene':''}`}>
      <nav className="app-navigation" aria-label="主导航">
        <div className="app-brand"><BrandMark/><strong>Chat3D</strong></div>

        <div className="navigation-pages">{([['home','首页','首页'],['asset','资产','资产库'],['scene','场景','场景库'],['workbench','工作台','建模工作台']] as const).map(([page,label,accessibleLabel])=><Button variant="ghost" color="gray" key={page} title={accessibleLabel} aria-label={accessibleLabel} disabled={librarySaving||!workspace.ready} aria-current={modulePage===page?'page':undefined} onClick={()=>{setModulePage(page);setFocusScene(false);}}><span>{label}</span></Button>)}</div>
        <div className="navigation-utilities"><AppearanceMenu/><TaskQueue openRequest={taskQueueRequest} disabled={librarySaving||!workspace.ready} onOpen={()=>{setModulePage('workbench');setFocusScene(false);setAssistantOpen(true);setAssistantTab('chat');}} onHistory={()=>{setModulePage('tasks');setFocusScene(false);}}/><Button variant="ghost" color="gray" title="设置" aria-label="设置" disabled={librarySaving||!workspace.ready} aria-current={modulePage==='settings'?'page':undefined} onClick={()=>setModulePage('settings')}><GearIcon/></Button></div>
      </nav>
      <section className="studio-main">

        {saveNotice&&!workspace.error&&<SaveToast message={projectNotice} onClose={closeSaveNotice}/>}
        {(workspace.error||autosaveError||(projectNotice&&!saveNotice))&&<div role="status" className={`workspace-notice ${workspace.error||autosaveError?'is-error':''}`}><span>{workspace.error||autosaveError||projectNotice}</span>{!workspace.error&&!autosaveError&&<IconButton size="1" variant="ghost" color="gray" aria-label="关闭通知" onClick={()=>setProjectNotice('')}><Cross1Icon/></IconButton>}</div>}
        {!workspace.ready&&<div className="workspace-loading"><Spinner size="3"/><p>正在恢复项目…</p></div>}
        {workspace.ready&&<StudioHome onTasks={()=>setTaskQueueRequest(v=>v+1)} onConfigure={()=>setShowSettings(true)} onGenerate={projectId=>setAutoStartRequest({id:makeId(),projectId})} hidden={modulePage!=='home'} onOpen={()=>{setModulePage('workbench');setAssistantOpen(true);setAssistantTab('chat');}} onLibrary={setModulePage}/>}
        {workspace.ready&&(modulePage==='asset'||modulePage==='scene')&&<ProjectLibrary key={modulePage+libraryRefresh} kind={modulePage} onOpen={()=>{setModulePage('workbench');setAssistantOpen(true);}} onManage={()=>setShowAssets(true)}/>}
        {workspace.ready&&modulePage==='tasks'&&<TaskCenter locked={locked} onOpen={()=>{setModulePage('workbench');setAssistantOpen(true);setAssistantTab('chat');}}/>}
        {workspace.ready&&modulePage==='settings'&&<StudioSettings onModel={()=>setShowSettings(true)} onBackup={()=>setShowTools(true)} onAssets={()=>setShowAssets(true)} onHistory={()=>setShowHistory(true)}/>}
        {workspace.ready&&<div className={`editor-workspace ${assistantOpen?'assistant-expanded':''}`} hidden={modulePage!=='workbench'}>
        <header className="studio-header workbench-project-actions" hidden={modulePage!=='workbench'}>
          <div className="workbench-view-controls"/>
          <div className="workbench-document-controls"><Popover.Root><Popover.Trigger><Button variant="ghost" color="gray" aria-label="项目状态" title={active?.title}><LayersIcon/></Button></Popover.Trigger><Popover.Content className="workbench-project-info" aria-label="项目信息" side="top" align="end" sideOffset={12}>          <span className="canvas-project-title" title={active?.title}>{active?.title??'正在恢复工作台…'}</span>
          <Badge color={workspace.error?'red':workspace.saving?'amber':'gray'} variant="soft" className="save-badge">{workspace.error?'保存异常':workspace.saving?'正在保存':'会话已自动保存到本浏览器'}</Badge>
          {active?.assetSource&&<Badge color={(active.assetCatalogVersion??active.assetSource.version)>active.assetSource.version?'amber':'gray'} variant="soft">编辑 v{active.assetSource.version}{(active.assetCatalogVersion??0)>active.assetSource.version?` · 库内最新 v${active.assetCatalogVersion}，当前草稿未替换`:''}</Badge>}
          <span className="editor-save-state">{active?.snapshot.pendingBatch?'待确认':!active?.librarySavedAt?'草稿':active.savedRevision===useEditorStore.getState().doc.revision?'已保存到库':'未保存到库'}</span></Popover.Content></Popover.Root>
          <HeroButton className="workbench-save" variant="primary" aria-label={librarySaving?'正在保存…':active?.moduleKind==='asset'?'保存资产':'保存场景'} isDisabled={locked||librarySaving||!workspace.ready} onPress={()=>{if(active?.moduleKind==='asset'&&!useEditorStore.getState().doc.nodes.length){setProjectNotice('还没有可保存的模型。请先创建或导入模型，再保存到资产库。');setAssistantOpen(true);setAssistantTab('chat');return;}setShowLibrarySave(true);}}>{librarySaving?'保存中…':'保存'}</HeroButton>
          <HeroButton isIconOnly variant="ghost" aria-label="模型配置" onPress={()=>setShowSettings(true)}><GearIcon/></HeroButton>
          <DropdownMenu.Root><DropdownMenu.Trigger><Button variant="ghost" color="gray" aria-label="导出与更多" disabled={locked||!workspace.ready}>导出 <ChevronDownIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content>

            <DropdownMenu.Item onSelect={()=>fileRef.current?.click()}><UploadIcon/>导入项目 JSON</DropdownMenu.Item>
            <DropdownMenu.Item title="静态网格，导入到新会话" onSelect={()=>modelFileRef.current?.click()}><CubeIcon/>导入模型 GLB</DropdownMenu.Item>
            <DropdownMenu.Separator/>
            <DropdownMenu.Item title="保存可重新编辑的工程，包含动画" onSelect={saveProject}><DownloadIcon/>下载项目 JSON</DropdownMenu.Item>

            <DropdownMenu.Item title="导出静态模型和材质，不含动画" disabled={exporting||nodeCount===0} onSelect={()=>void downloadGlb()}><CubeIcon/>{exporting?'导出中…':'导出模型 GLB'}</DropdownMenu.Item><DropdownMenu.Separator/><DropdownMenu.Item onSelect={()=>setShowTools(true)}><GearIcon/>检查与备份</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Root>
          </div>
          <input ref={fileRef} type="file" accept=".json,.chat3d.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void openProject(file);}}/>
          <input ref={modelFileRef} type="file" accept=".glb" className="hidden" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GLB超过20MB');setProjectNotice('正在校验并导入网格模型…');const result=await importGlb(await file.arrayBuffer(),file.name);if(!createSession(result.doc))throw Error('请结束当前生成后再导入');setProjectNotice(`已导入 ${result.doc.nodes.length} 个网格部件到新会话。${result.warnings.join(' ')}`);}catch(error){setProjectNotice(`网格导入失败：${error instanceof Error?error.message:String(error)}`);}}}/>
        </header>
        <nav className="canvas-tool-rail canvas-surface" aria-label="画布工具"><HeroButton variant="ghost" aria-pressed={shelfOpen} onPress={()=>{setShelfOpen(!shelfOpen);setStructureOpen(false);setInspectorOpen(false)}}><CubeIcon/><span>资产</span></HeroButton><HeroButton variant="ghost" aria-pressed={structureOpen} onPress={()=>{setStructureOpen(!structureOpen);setShelfOpen(false);setInspectorOpen(false)}}><LayersIcon/><span>结构</span></HeroButton><HeroButton variant="ghost" aria-pressed={inspectorOpen} isDisabled={!selection.length} onPress={()=>{if(inspectorOpen)setInspectorOpen(false);else openInspector();}}><MixerHorizontalIcon/><span>属性</span></HeroButton></nav>
        <div className="canvas-transform-tools canvas-surface" role="group" aria-label="场景编辑工具">
          <ToolbarAction label="选择对象" help="打开场景结构，从列表中选择要编辑的对象" onPress={()=>{setStructureOpen(!structureOpen);setShelfOpen(false);setInspectorOpen(false);}}><CursorArrowIcon/></ToolbarAction>
          <ToolbarAction pressed={selectionBox} label={selectionBox?'退出框选':'框选对象'} help="默认按可见表面框选；Shift / Ctrl / ⌘ 追加，Esc 取消。本次选择可在旁边开启穿透" disabled={!viewportReady||locked} disabledReason={!viewportReady?'三维视图不可用，可在结构列表中多选':'请先结束生成或处理预览'} onPress={()=>useSelectionTool.setState({box:!selectionBox})}><span aria-hidden="true">▧</span></ToolbarAction>
          {selectionBox&&<button className="box-selection-scope" aria-label={wholeModelBox?'框选范围：完整模型':'框选范围：零件'} title={wholeModelBox?'命中零件后扩展到完整模型，包含隐藏和框外成员':'仅选择框内命中的零件，不扩展同模型成员'} onClick={()=>useSelectionTool.setState({wholeModel:!wholeModelBox})}>{wholeModelBox?'框选模型':'框选零件'}</button>}
          {selectionBox&&<button className="box-selection-scope box-selection-through" aria-label="穿透框选" aria-pressed={throughBox} title={throughBox?'穿透已开启：包括被前方模型遮挡的几何；点击恢复可见表面框选':'穿透已关闭：只选最近几何表面（透明面按实体选取）；孔洞中的后方零件仍可能可见'} onClick={()=>useSelectionTool.setState({through:!throughBox})}>{throughBox?'穿透：开':'穿透：关'}</button>}
          <ToolbarAction label="移动选中对象" help="打开位置设置，调整选中内容的 X、Y、Z 坐标" disabled={!selection.length||locked} disabledReason={!selection.length?'请先选中一个或多个对象':previewing?'请先应用或放弃当前预览':'任务执行中，暂不能修改位置'} onPress={()=>{setPropertyTab('position');openInspector()}}><MoveIcon/></ToolbarAction>
          <ToolbarAction label="旋转选中对象" help="打开旋转设置，调整选中内容的朝向与角度" disabled={!selection.length||locked} disabledReason={!selection.length?'请先选中一个或多个对象':previewing?'请先应用或放弃当前预览':'任务执行中，暂不能旋转对象'} onPress={()=>{setPropertyTab('rotation');openInspector()}}><RotateCounterClockwiseIcon/></ToolbarAction>
          <ToolbarAction label="缩放选中对象" help="打开尺寸设置，调整选中内容的大小" disabled={!selection.length||locked} disabledReason={!selection.length?'请先选中一个或多个对象':previewing?'请先应用或放弃当前预览':'任务执行中，暂不能缩放对象'} onPress={()=>{setPropertyTab('size');openInspector()}}><SizeIcon/></ToolbarAction>
          <ToolbarAction label="聚焦选中对象" help="把镜头移动到选中内容附近，方便查看" disabled={!selection.length||!viewportReady} disabledReason={!selection.length?'请先选中一个或多个对象':'当前三维视图不可用'} onPress={()=>focusSceneObjects(selection)}><EnterFullScreenIcon/></ToolbarAction><span/>
          <DeleteSelectionAction active={workspace.ready&&modulePage==='workbench'} onNotice={setProjectNotice}/>
          <ToolbarAction label="撤销" help="撤回最近一次已应用的模型修改" disabled={!canUndo||locked} disabledReason={locked?(previewing?'请先应用或放弃当前预览':'请等待当前任务结束'):'当前没有可撤销的修改'} onPress={undo}><CounterClockwiseClockIcon/></ToolbarAction>
          <ToolbarAction label="重做" help="恢复刚才撤销的模型修改" disabled={!canRedo||locked} disabledReason={locked?(previewing?'请先应用或放弃当前预览':'请等待当前任务结束'):'当前没有可重做的修改'} onPress={redo}><ReloadIcon/></ToolbarAction>
          <ToolbarAction label={focusScene?'恢复工作台':'专注场景'} help={focusScene?'恢复对话与编辑面板':'暂时收起周边面板，放大模型画布'} onPress={()=>setFocusScene(!focusScene)}><EnterFullScreenIcon/></ToolbarAction>
        </div>
        {shelfOpen&&<CanvasAssetShelf onClose={()=>setShelfOpen(false)} onLibrary={()=>setShowAssets(true)}/>}
        <div className="editor-upper"><aside className="editor-objects canvas-surface" hidden={!structureOpen}><div className="editor-panel-heading">场景结构<HeroButton isIconOnly variant="ghost" aria-label="收起场景结构" onPress={()=>setStructureOpen(false)}><Cross1Icon/></HeroButton></div><ObjectTree/></aside>
          <main className="scene-region">
            <div className="scene-stage"><ViewportPanel/></div>
            <footer className="scene-footer"><span><span className="status-dot"/>{previewing?'预览尚未提交':locked?'正在处理草稿':'可编辑场景'}</span><span>单位 m · Y 轴向上</span><span>{dirty?'当前修改尚未导出备份':'项目文件无待导出修改'}</span></footer>
          </main>
          {!inspectorOpen&&<CanvasSelectionSummary onEdit={()=>openInspector()}/>}
          {inspectorOpen&&selection.length>0&&<CanvasInspector onClose={()=>setInspectorOpen(false)} onAdvanced={()=>setAdvancedOpen(true)} tab={propertyTab} setTab={setPropertyTab}/>}

        </div><div className="assistant-dock-bar"><Button variant="soft" color="gray" aria-expanded={assistantOpen} aria-label={assistantOpen?'收起 AI 助手':'打开 AI 助手'} title="描述需求，开始建模" onClick={()=>{setAssistantOpen(!assistantOpen);setAssistantTab('chat')}}><ChatBubbleIcon/>AI 助手</Button><span>{previewing?'修改已生成，待确认':locked?'正在执行':nodeCount+' 个零件'}</span><button onClick={()=>{setModulePage('tasks');}}>查看任务</button></div>
          <aside className="conversation-region" hidden={!assistantOpen}><ConversationResize width={assistantWidth} onChange={setAssistantWidth}/><header className="conversation-panel-title"><strong>AI 建模</strong><HeroButton isIconOnly variant="ghost" aria-label="收起对话区" onPress={()=>setAssistantOpen(false)}><Cross1Icon/></HeroButton></header><div className="conversation-heading"><div className="assistant-tabs" role="tablist" aria-label="助手工作区" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'chat':e.key==='End'?'tasks':assistantTab==='chat'?'tasks':'chat';setAssistantTab(next);document.getElementById(next==='chat'?'chat-tab':'task-tab')?.focus();}}}><button role="tab" id="chat-tab" tabIndex={assistantTab==='chat'?0:-1} aria-controls="chat-content" aria-selected={assistantTab==='chat'} onClick={()=>setAssistantTab('chat')}><ChatBubbleIcon/>对话</button><button role="tab" id="task-tab" tabIndex={assistantTab==='tasks'?0:-1} aria-controls="task-content" aria-selected={assistantTab==='tasks'} onClick={()=>setAssistantTab('tasks')}>任务记录{locked&&<span className="tab-activity"/>}</button></div></div><div role="tabpanel" id="chat-content" aria-labelledby="chat-tab" hidden={assistantTab!=='chat'} className="assistant-content"><ChatPanel autoStartRequest={autoStartRequest} onAutoStartConsumed={id=>setAutoStartRequest(current=>current?.id===id?null:current)} key={workspace.activeId} canvasMode expanded onExpand={()=>setAssistantOpen(true)} executionDetails={false} onAssets={()=>setShowAssets(true)} onConfigure={()=>setShowSettings(true)}/></div><div role="tabpanel" id="task-content" aria-labelledby="task-tab" hidden={assistantTab!=='tasks'} className="assistant-content"><TaskPanel onConversation={()=>setAssistantTab('chat')}/></div></aside>
        </div>}
      </section>
      {advancedOpen&&<Dialog.Root open onOpenChange={setAdvancedOpen}><Dialog.Content className="canvas-advanced-dialog" style={{maxWidth:640,maxHeight:'85vh',overflow:'auto'}}><Dialog.Title>对象与属性</Dialog.Title><Dialog.Description>精确编辑几何参数、外观和组件关系。</Dialog.Description><PropertiesPanel/><Button onClick={()=>setAdvancedOpen(false)}>关闭高级属性</Button></Dialog.Content></Dialog.Root>}
      {showLibrarySave&&<LibraryProjectSaveDialog onClose={()=>setShowLibrarySave(false)} onBusyChange={setLibrarySaving} onSaved={notice=>{setProjectNotice(notice);setLibraryRefresh(v=>v+1);}}/>}
      {showAssets&&<AssetLibrary intent={modulePage==='workbench'?'insert':'manage'} targetName={active?.title} onClose={()=>{setShowAssets(false);setLibraryRefresh(v=>v+1);}}/>}
      {showHistory&&<Dialog.Root open onOpenChange={setShowHistory}><Dialog.Content style={{maxWidth:430}}><Dialog.Title>旧项目与回收站</Dialog.Title><Dialog.Description>历史项目仍保留，可重命名、恢复或继续编辑。</Dialog.Description><div className="history-management"><SessionSidebar locked={locked} onClose={()=>{setShowHistory(false);setModulePage('workbench');}}/></div><Button onClick={()=>{setShowHistory(false);setModulePage('workbench');}}>进入选中项目</Button></Dialog.Content></Dialog.Root>}
      {showTools&&<WorkspaceTools onClose={()=>setShowTools(false)}/>}
      {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)}/>}
    </div>
  </AppearanceProvider>;
}
