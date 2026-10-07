import {normalizeLibraryMetadata,validCategory,type LibraryMetadata} from './domain/libraryMetadata';
import {progressOnlyChange} from './domain/workspaceSavePolicy';
import { create } from 'zustand';
import { useEditorStore, createEditorStore, setWorkspacePersistenceActive, createInitialDoc, type EditorState, type EditorStore } from './store';
import {bindConversationStore} from './conversationStores';
import { parseProject, serializeProject } from './domain/project';
import { readWorkspace, writeWorkspace } from './domain/workspaceStorage';
import { makeId } from './util/ids';

export type Snapshot=Pick<EditorState,'doc'|'messages'|'selection'|'dirty'|'past'|'future'|'composerText'|'composerImages'|'lastRun'> & {
  pendingBatch:EditorState['pendingBatch'];pendingResult:EditorState['pendingResult'];wasRunning:boolean;
};
export interface WorkspaceSession {assetCatalogVersion?:number;sceneCategory?:string;libraryDescription?:string;libraryMetadataRevision?:number;moduleKind?:'asset'|'scene';assetSource?:{id:string;version:number};assetCategory?:import('./domain/modelAssets').AssetCategory;sceneThumbnail?:string;librarySavedAt?:number;savedRevision?:number;id:string;title:string;autoTitle:boolean;pinned?:boolean;createdAt:number;updatedAt:number;deletedAt:number|null;snapshot:Snapshot}
interface WorkspaceState {ready:boolean;saving:boolean;error:string|null;activeId:string;sessions:WorkspaceSession[]}
export const useWorkspaceStore=create<WorkspaceState>(()=>({ready:false,saving:false,error:null,activeId:'',sessions:[]}));
const stores=new Map<string,EditorStore>();
export const getSessionEditor=(id:string)=>stores.get(id);
export const sessionIsRunning=(id:string)=>{const state=stores.get(id)?.getState();return !!state&&['capturing','context','generating','validating','applying'].includes(state.aiStatus);};
export const anySessionRunning=()=>[...stores.keys()].some(sessionIsRunning);
const busy=anySessionRunning;
const snapshot=(s:EditorState=useEditorStore.getState()):Snapshot=>{return {doc:s.doc,messages:s.messages,selection:s.selection,dirty:s.dirty,past:s.past,future:s.future,composerText:s.composerText,composerImages:s.composerImages,lastRun:s.lastRun,pendingBatch:s.pendingBatch,pendingResult:s.pendingResult,wasRunning:['capturing','context','generating','validating','applying'].includes(s.aiStatus)}};
const fresh=():Snapshot=>({doc:createInitialDoc(),messages:[],selection:[],dirty:false,past:[],future:[],composerText:'',composerImages:[],lastRun:null,pendingBatch:null,pendingResult:null,wasRunning:false});
const record=(snap:Snapshot,title='新建会话'):WorkspaceSession=>({id:makeId(),title,autoTitle:title==='新建会话',createdAt:Date.now(),updatedAt:Date.now(),deletedAt:null,snapshot:snap});
let hydrating=false, revision=0, pending=false, saving=false, blocked=false;
let timer:ReturnType<typeof setTimeout>|undefined;
let initialized:Promise<void>|null=null;
let waiters:(()=>void)[]=[];
/** Recovery only happens when loading durable data, never during navigation. */
export function recoverSession(session:WorkspaceSession):WorkspaceSession {
  const s=session.snapshot;
  const interrupted=s.wasRunning||s.messages.some(m=>m.run?.status==='running');
  const recoveredMessages=s.messages.map(m=>m.steering?.status==='queued'?{...m,steering:{...m.steering,status:'interrupted' as const}}:m).map(m=>m.run?.status==='running'?{...m,run:{...m.run,status:'stopped' as const,endedAt:m.run.activity?.lastEventAt??m.createdAt}}:m);
  const messages=interrupted?[...recoveredMessages,{id:makeId(),role:'assistant' as const,text:s.pendingBatch?'上次生成中断，已恢复最近保存的阶段草稿（未完成复核），原场景未修改。不会自动继续调用模型。':'上次生成因页面关闭或刷新中断，尚无可恢复的阶段草稿；已恢复原场景和聊天。不会自动继续调用模型。',createdAt:Date.now()}]:recoveredMessages;
  return {...session,snapshot:{...s,messages,wasRunning:false}};
}
function writeSnapshot(id:string,state:EditorState){
  const snap=snapshot(state);
  useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,snapshot:snap,updatedAt:Date.now(),title:s.autoTitle&&snap.messages.some(m=>m.role==='user')?(snap.messages.find(m=>m.role==='user')!.text.slice(0,24)||'图片建模'):s.title}:s)}));
}
function track(session:WorkspaceSession){
  if(stores.has(session.id))return stores.get(session.id)!;
  const s=session.snapshot;
  const editor=createEditorStore({...s,aiStatus:s.pendingBatch&&s.pendingResult?'previewing':'idle',previewDoc:s.pendingResult?.doc??null,aiError:null});
  stores.set(session.id,editor);
  editor.subscribe((state,prev)=>{
    if(state.doc!==prev.doc||state.messages!==prev.messages||state.past!==prev.past||state.future!==prev.future||state.dirty!==prev.dirty||state.composerText!==prev.composerText||state.composerImages!==prev.composerImages||state.lastRun!==prev.lastRun||state.aiStatus!==prev.aiStatus||state.pendingBatch!==prev.pendingBatch||state.pendingResult!==prev.pendingResult){
      writeSnapshot(session.id,state);schedule(progressOnlyChange(state,prev));
    }
  });
  return editor;
}
function restore(session:WorkspaceSession){hydrating=true;try{bindConversationStore(track(session));}finally{hydrating=false;}}
function capture(){const w=useWorkspaceStore.getState(),editor=stores.get(w.activeId);if(editor)writeSnapshot(w.activeId,editor.getState());}
function schedule(progressOnly=false){
  if(hydrating||blocked||!useWorkspaceStore.getState().ready)return;
  pending=true;useWorkspaceStore.setState({saving:true});
  if(progressOnly&&timer)return;
  if(timer)clearTimeout(timer);timer=setTimeout(()=>void flushWorkspace(),progressOnly?5000:250);
}
export async function flushWorkspace():Promise<void>{
  if(timer)clearTimeout(timer);timer=undefined;
  if(saving)return new Promise<void>(resolve=>waiters.push(resolve));
  if(blocked||!pending)return;
  saving=true;pending=false;
  const w=useWorkspaceStore.getState();
  try{revision=await writeWorkspace({version:1,activeId:w.activeId,sessions:w.sessions},revision);setWorkspacePersistenceActive(true);useWorkspaceStore.setState({error:null});}
  catch(e){blocked=true;pending=false;useWorkspaceStore.setState({error:e instanceof Error?e.message:'会话保存失败'});}
  finally{saving=false;useWorkspaceStore.setState({saving:pending});if(pending)await flushWorkspace();else {const done=waiters;waiters=[];done.forEach(resolve=>resolve());}}
}
function validate(raw:unknown):WorkspaceSession{
  const s=raw as WorkspaceSession;
  if(!s||typeof s.id!=='string'||typeof s.title!=='string'||!s.snapshot||!Array.isArray(s.snapshot.messages))throw new Error('会话数据格式不正确');
  const snap=s.snapshot;
  if(s.moduleKind!==undefined&&!['asset','scene'].includes(s.moduleKind))throw Error('项目类型无效');
  if(s.assetSource&&(!/^[-a-zA-Z0-9_]{1,100}$/.test(s.assetSource.id)||!Number.isSafeInteger(s.assetSource.version)||s.assetSource.version<1))throw Error('资产来源无效');
  if(snap.messages.some(m=>!m||typeof m.id!=='string'||typeof m.text!=='string'||!['user','assistant','system'].includes(m.role)||(m.images!==undefined&&(!Array.isArray(m.images)||m.images.some(i=>typeof i!=='string')))))throw new Error('会话消息格式无效，已有存储不会被覆盖');
  const doc=parseProject(serializeProject(snap.doc));
  if(snap.pendingResult){snap.pendingResult.doc=parseProject(serializeProject(snap.pendingResult.doc));if(snap.pendingBatch?.baseRevision!==doc.revision||snap.pendingBatch.projectId!==doc.projectId||snap.pendingResult.doc.projectId!==doc.projectId)throw new Error('会话预览基线无效');}
  return {...s,title:s.title.slice(0,80),snapshot:{...snap,doc,composerText:snap.composerText??'',composerImages:snap.composerImages??[],lastRun:snap.lastRun??null,past:snap.past??[],future:snap.future??[]}};
}
export function initializeWorkspace():Promise<void>{
  if(initialized)return initialized;
  initialized=(async()=>{
    try{
      const stored=await readWorkspace();
      if(stored){
        if(stored.version!==1||!Array.isArray(stored.sessions))throw new Error('会话数据版本不受支持，请先备份本页项目');
        const sessions=stored.sessions.map(validate).map(recoverSession);let active=sessions.find(s=>s.id===stored.activeId&&!s.deletedAt)??sessions.find(s=>!s.deletedAt);
        if(!active){active=record(fresh());sessions.push(active);}
        setWorkspacePersistenceActive(true);revision=stored.revision;useWorkspaceStore.setState({sessions,activeId:active.id,ready:true});sessions.forEach(track);restore(active);
      }else{const first=record(snapshot(),useEditorStore.getState().doc.nodes.length?'恢复的项目':'新建会话');useWorkspaceStore.setState({sessions:[first],activeId:first.id,ready:true});restore(first);}
      schedule();await flushWorkspace();
    }catch(e){blocked=true;const first=record(snapshot(),'当前项目');useWorkspaceStore.setState({ready:true,activeId:first.id,sessions:[first],error:e instanceof Error?e.message:'会话恢复失败；已有存储不会被覆盖'});restore(first);}
  })();return initialized;
}
export function createSession(document?:EditorState['doc'],metadata:Partial<Pick<WorkspaceSession,'moduleKind'|'assetSource'|'assetCatalogVersion'|'assetCategory'|'title'|'sceneCategory'|'libraryDescription'|'libraryMetadataRevision'|'librarySavedAt'|'savedRevision'>>={}):boolean{
  if(!useWorkspaceStore.getState().ready||blocked)return false;
  capture();const next={...record(document?{...fresh(),doc:document}:fresh(),metadata.title??'新建会话'),...metadata};const w=useWorkspaceStore.getState();useWorkspaceStore.setState({sessions:[next,...w.sessions],activeId:next.id});restore(next);schedule();return true;
}
export function updateLibrarySession(id:string,metadata:Partial<Pick<WorkspaceSession,'moduleKind'|'assetSource'|'assetCatalogVersion'|'assetCategory'|'librarySavedAt'|'savedRevision'|'sceneThumbnail'|'title'|'autoTitle'|'sceneCategory'|'libraryDescription'|'libraryMetadataRevision'>>):void{
 if(blocked)throw Error('请先解决工作区保存错误');
 if(!useWorkspaceStore.getState().sessions.some(s=>s.id===id&&!s.deletedAt))throw Error('项目不存在或已移入回收站');
 useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,...metadata}:s)}));schedule();
}
/** Catalog name changes update linked editor labels without replacing any draft or version. */
export async function syncAssetCatalogMetadata(asset:{id:string;name:string;category:string;description?:string;metadataRevision?:number}):Promise<void>{
 if(blocked)throw Error('资产信息已保存，但编辑项目同步受存储错误影响，请处理后重新打开');
 useWorkspaceStore.setState(w=>({sessions:w.sessions.map(session=>session.moduleKind==='asset'&&session.assetSource?.id===asset.id&&!session.deletedAt&&(asset.metadataRevision??0)>=(session.libraryMetadataRevision??0)?{...session,title:asset.name,autoTitle:false,assetCategory:asset.category,libraryDescription:asset.description,libraryMetadataRevision:asset.metadataRevision??0}:session)}));
 schedule();await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('资产信息已保存，但编辑项目名称同步失败，请重新打开资产核对');
}
export function switchSession(id:string):boolean{
  if(blocked)return false;const w=useWorkspaceStore.getState();if(id===w.activeId)return true;
  const next=w.sessions.find(s=>s.id===id&&!s.deletedAt);if(!next)return false;
  capture();useWorkspaceStore.setState({activeId:id});restore(next);schedule();return true;
}
export function renameSession(id:string,title:string):boolean{
  if(blocked||!title.trim())return false;
  useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,title:title.trim().slice(0,80),autoTitle:false}:s)}));schedule();return true;
}
export function toggleSessionPinned(id:string):boolean{
 if(blocked||sessionIsRunning(id))return false;const target=useWorkspaceStore.getState().sessions.find(s=>s.id===id&&!s.deletedAt);if(!target)return false;
 useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,pinned:!s.pinned}:s)}));schedule();return true;
}
export function trashSession(id:string):boolean{
  if(sessionIsRunning(id)||blocked)return false;capture();const w=useWorkspaceStore.getState();
  let sessions=w.sessions.map(s=>s.id===id?{...s,deletedAt:Date.now()}:s);
  let active=sessions.find(s=>s.id===w.activeId&&!s.deletedAt)??sessions.find(s=>!s.deletedAt);
  if(!active){active=record(fresh());sessions=[active,...sessions];}
  useWorkspaceStore.setState({sessions,activeId:active.id});restore(active);schedule();return true;
}
export function restoreSession(id:string):void{
  if(blocked)return;useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,deletedAt:null}:s)}));schedule();
}


/** Portable local backup. No model configuration or browser credentials are included. */
export function exportWorkspaceBackup():string{
 if(busy())throw Error('请先停止生成再备份，以保存一致的草稿');capture();
 const sessions=useWorkspaceStore.getState().sessions.filter(s=>!s.deletedAt).map(s=>({moduleKind:s.moduleKind??'scene',assetCategory:s.assetCategory,sceneCategory:s.sceneCategory,libraryDescription:s.libraryDescription,title:s.title,pinned:!!s.pinned,project:JSON.parse(serializeProject(s.snapshot.doc)),draft:s.snapshot.pendingResult?JSON.parse(serializeProject(s.snapshot.pendingResult.doc)):null,messages:s.snapshot.messages.map(m=>({role:m.role,text:m.text,createdAt:m.createdAt})),composerText:s.snapshot.composerText}));
 const output=JSON.stringify({format:'chat3d-workspace-backup',version:1,createdAt:new Date().toISOString(),sessions});
 if(new TextEncoder().encode(output).length>50*1024*1024)throw Error('备份超过50MB，请分别导出项目');return output;
}
export function importWorkspaceBackup(text:string):number{
 if(busy()||blocked||!useWorkspaceStore.getState().ready)throw Error('请先结束当前任务并解决存储错误');
 if(new TextEncoder().encode(text).length>50*1024*1024)throw Error('备份超过50MB');
 const pack=JSON.parse(text);if(pack?.format!=='chat3d-workspace-backup'||pack.version!==1||!Array.isArray(pack.sessions)||pack.sessions.length>100)throw Error('备份格式错误，或会话超过100');
 const next:WorkspaceSession[]=[];
 for(const item of pack.sessions){
  if(typeof item.title!=='string'||!Array.isArray(item.messages)||item.messages.length>10000||typeof item.composerText!=='string')throw Error('备份会话格式无效');
  const messages=item.messages.map((m:{role:string;text:string;createdAt:number})=>{if(!m||!['user','assistant','system'].includes(m.role)||typeof m.text!=='string'||m.text.length>200000)throw Error('备份消息格式无效');return {id:makeId(),role:m.role as 'user'|'assistant'|'system',text:m.text,createdAt:Number.isFinite(m.createdAt)?m.createdAt:Date.now()};});
  const doc=parseProject(JSON.stringify(item.project));
  const r=record({...fresh(),doc,messages,composerText:item.composerText.slice(0,200000)},item.title.slice(0,80)+'（导入）');r.pinned=!!item.pinned;r.moduleKind=item.moduleKind==='asset'?'asset':'scene';r.assetCategory=validCategory(item.assetCategory)?item.assetCategory:undefined;r.sceneCategory=validCategory(item.sceneCategory)?item.sceneCategory:undefined;r.libraryDescription=typeof item.libraryDescription==='string'?item.libraryDescription.slice(0,1000):undefined;next.push(r);
  // Pending work is imported as a separate explicitly-labelled recovery project,
  // never silently committed to the original or trusted as an executable batch.
  if(item.draft){const draft=parseProject(JSON.stringify(item.draft));next.push(record({...fresh(),doc:draft},item.title.slice(0,65)+'（未确认草稿副本）'));}
 }
 capture();next.forEach(track);useWorkspaceStore.setState(w=>({sessions:[...next,...w.sessions]}));schedule();return next.length;
}

export async function editLibrarySessionMetadata(id:string,details:LibraryMetadata,expectedRevision=0):Promise<void>{
 const target=useWorkspaceStore.getState().sessions.find(s=>s.id===id&&!s.deletedAt);if(!target)throw Error('项目不存在');
 if(!useWorkspaceStore.getState().ready||useWorkspaceStore.getState().error||sessionIsRunning(id)||stores.get(id)?.getState().aiStatus==='previewing')throw Error('请先处理当前任务、预览或保存异常');
 if((target.libraryMetadataRevision??0)!==expectedRevision)throw Error('项目信息已更新，请关闭后重新打开');
 const detailsSafe=normalizeLibraryMetadata(details,target.moduleKind??'scene');
 updateLibrarySession(id,{title:detailsSafe.name,autoTitle:false,...(target.moduleKind==='asset'?{assetCategory:detailsSafe.category}:{sceneCategory:detailsSafe.category}),libraryDescription:detailsSafe.description,libraryMetadataRevision:expectedRevision+1});
 await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error(useWorkspaceStore.getState().error!);
}
