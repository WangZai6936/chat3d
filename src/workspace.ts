import {progressOnlyChange} from './domain/workspaceSavePolicy';
import { create } from 'zustand';
import { useEditorStore, setWorkspacePersistenceActive, createInitialDoc, type EditorState } from './store';
import { parseProject, serializeProject } from './domain/project';
import { readWorkspace, writeWorkspace } from './domain/workspaceStorage';
import { makeId } from './util/ids';

type Snapshot=Pick<EditorState,'doc'|'messages'|'selection'|'dirty'|'past'|'future'|'composerText'|'composerImages'|'lastRun'> & {
  pendingBatch:EditorState['pendingBatch'];pendingResult:EditorState['pendingResult'];wasRunning:boolean;
};
export interface WorkspaceSession {moduleKind?:'asset'|'scene';assetSource?:{id:string;version:number};assetCategory?:import('./domain/modelAssets').AssetCategory;sceneThumbnail?:string;librarySavedAt?:number;savedRevision?:number;id:string;title:string;autoTitle:boolean;pinned?:boolean;createdAt:number;updatedAt:number;deletedAt:number|null;snapshot:Snapshot}
interface WorkspaceState {ready:boolean;saving:boolean;error:string|null;activeId:string;sessions:WorkspaceSession[]}
export const useWorkspaceStore=create<WorkspaceState>(()=>({ready:false,saving:false,error:null,activeId:'',sessions:[]}));
const busy=()=>['capturing','context','generating','validating','applying'].includes(useEditorStore.getState().aiStatus);
const snapshot=():Snapshot=>{const s=useEditorStore.getState();return {doc:s.doc,messages:s.messages,selection:s.selection,dirty:s.dirty,past:s.past,future:s.future,composerText:s.composerText,composerImages:s.composerImages,lastRun:s.lastRun,pendingBatch:s.pendingBatch,pendingResult:s.pendingResult,wasRunning:['capturing','context','generating','validating','applying'].includes(s.aiStatus)}};
const fresh=():Snapshot=>({doc:createInitialDoc(),messages:[],selection:[],dirty:false,past:[],future:[],composerText:'',composerImages:[],lastRun:null,pendingBatch:null,pendingResult:null,wasRunning:false});
const record=(snap:Snapshot,title='新建会话'):WorkspaceSession=>({id:makeId(),title,autoTitle:title==='新建会话',createdAt:Date.now(),updatedAt:Date.now(),deletedAt:null,snapshot:snap});
let hydrating=false, revision=0, pending=false, saving=false, blocked=false;
let timer:ReturnType<typeof setTimeout>|undefined;
let initialized:Promise<void>|null=null;
let waiters:(()=>void)[]=[];
function restore(session:WorkspaceSession){
  const s=session.snapshot;
  const recoveredMessages=s.messages.map(m=>m.steering?.status==='queued'?{...m,steering:{...m.steering,status:'interrupted' as const}}:m).map(m=>m.run?.status==='running'?{...m,run:{...m.run,status:'stopped' as const,endedAt:m.run.activity?.lastEventAt??m.createdAt}}:m);
  const messages=s.wasRunning?[...recoveredMessages,{id:makeId(),role:'assistant' as const,text:s.pendingBatch?'上次生成中断，已恢复最近保存的阶段草稿（未完成复核），原场景未修改。':'上次生成因页面关闭或刷新中断，尚无可恢复的阶段草稿；已恢复原场景和聊天。',createdAt:Date.now()}]:recoveredMessages;
  hydrating=true;
  useEditorStore.setState({...s,messages,aiStatus:s.pendingBatch&&s.pendingResult?'previewing':'idle',previewDoc:s.pendingResult?.doc??null,aiError:null});
  hydrating=false;
}
function capture(){
  const w=useWorkspaceStore.getState();const snap=snapshot();
  useWorkspaceStore.setState({sessions:w.sessions.map(s=>s.id===w.activeId?{...s,snapshot:snap,updatedAt:Date.now(),title:s.autoTitle&&snap.messages.some(m=>m.role==='user')?(snap.messages.find(m=>m.role==='user')!.text.slice(0,24)||'图片建模'):s.title}:s)});
}
function schedule(progressOnly=false){
  if(hydrating||blocked||!useWorkspaceStore.getState().ready)return;
  capture();pending=true;useWorkspaceStore.setState({saving:true});
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
  if(snap.pendingResult){snap.pendingResult.doc=parseProject(serializeProject(snap.pendingResult.doc));if(snap.pendingBatch?.baseRevision!==doc.revision)throw new Error('会话预览基线无效');}
  return {...s,title:s.title.slice(0,80),snapshot:{...snap,doc,composerText:snap.composerText??'',composerImages:snap.composerImages??[],lastRun:snap.lastRun??null,past:snap.past??[],future:snap.future??[]}};
}
export function initializeWorkspace():Promise<void>{
  if(initialized)return initialized;
  initialized=(async()=>{
    try{
      const stored=await readWorkspace();
      if(stored){
        if(stored.version!==1||!Array.isArray(stored.sessions))throw new Error('会话数据版本不受支持，请先备份本页项目');
        const sessions=stored.sessions.map(validate);let active=sessions.find(s=>s.id===stored.activeId&&!s.deletedAt)??sessions.find(s=>!s.deletedAt);
        if(!active){active=record(fresh());sessions.push(active);}
        setWorkspacePersistenceActive(true);revision=stored.revision;useWorkspaceStore.setState({sessions,activeId:active.id,ready:true});restore(active);
      }else{const first=record(snapshot(),useEditorStore.getState().doc.nodes.length?'恢复的项目':'新建会话');useWorkspaceStore.setState({sessions:[first],activeId:first.id,ready:true});}
      schedule();await flushWorkspace();
    }catch(e){blocked=true;const first=record(snapshot(),'当前项目');useWorkspaceStore.setState({ready:true,activeId:first.id,sessions:[first],error:e instanceof Error?e.message:'会话恢复失败；已有存储不会被覆盖'});}
  })();return initialized;
}
export function createSession(document?:EditorState['doc'],metadata:Partial<Pick<WorkspaceSession,'moduleKind'|'assetSource'|'assetCategory'|'title'>>={}):boolean{
  if(!useWorkspaceStore.getState().ready||busy()||blocked)return false;
  capture();const next={...record(document?{...fresh(),doc:document}:fresh(),metadata.title??'新建会话'),...metadata};const w=useWorkspaceStore.getState();useWorkspaceStore.setState({sessions:[next,...w.sessions],activeId:next.id});restore(next);schedule();return true;
}
export function updateLibrarySession(id:string,metadata:Pick<WorkspaceSession,'moduleKind'|'assetSource'|'assetCategory'|'librarySavedAt'|'savedRevision'|'sceneThumbnail'>):void{
 if(blocked)throw Error('请先解决工作区保存错误');
 useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,...metadata}:s)}));schedule();
}
export function switchSession(id:string):boolean{
  if(busy()||blocked)return false;const w=useWorkspaceStore.getState();if(id===w.activeId)return true;
  const next=w.sessions.find(s=>s.id===id&&!s.deletedAt);if(!next)return false;
  capture();useWorkspaceStore.setState({activeId:id});restore(next);schedule();return true;
}
export function renameSession(id:string,title:string):boolean{
  if(blocked||!title.trim())return false;
  useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,title:title.trim().slice(0,80),autoTitle:false}:s)}));schedule();return true;
}
export function toggleSessionPinned(id:string):boolean{
 if(blocked||busy())return false;const target=useWorkspaceStore.getState().sessions.find(s=>s.id===id&&!s.deletedAt);if(!target)return false;
 useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,pinned:!s.pinned}:s)}));schedule();return true;
}
export function trashSession(id:string):boolean{
  if(busy()||blocked)return false;capture();const w=useWorkspaceStore.getState();
  let sessions=w.sessions.map(s=>s.id===id?{...s,deletedAt:Date.now()}:s);
  let active=sessions.find(s=>s.id===w.activeId&&!s.deletedAt)??sessions.find(s=>!s.deletedAt);
  if(!active){active=record(fresh());sessions=[active,...sessions];}
  useWorkspaceStore.setState({sessions,activeId:active.id});restore(active);schedule();return true;
}
export function restoreSession(id:string):void{
  if(blocked)return;useWorkspaceStore.setState(w=>({sessions:w.sessions.map(s=>s.id===id?{...s,deletedAt:null}:s)}));schedule();
}
useEditorStore.subscribe((s,prev)=>{
  if(s.doc!==prev.doc||s.messages!==prev.messages||s.past!==prev.past||s.future!==prev.future||s.dirty!==prev.dirty||s.composerText!==prev.composerText||s.composerImages!==prev.composerImages||s.lastRun!==prev.lastRun||s.aiStatus!==prev.aiStatus||s.pendingBatch!==prev.pendingBatch||s.pendingResult!==prev.pendingResult)schedule(progressOnlyChange(s,prev));
});

/** Portable local backup. No model configuration or browser credentials are included. */
export function exportWorkspaceBackup():string{
 if(busy())throw Error('请先停止生成再备份，以保存一致的草稿');capture();
 const sessions=useWorkspaceStore.getState().sessions.filter(s=>!s.deletedAt).map(s=>({moduleKind:s.moduleKind??'scene',assetCategory:s.assetCategory,title:s.title,pinned:!!s.pinned,project:JSON.parse(serializeProject(s.snapshot.doc)),draft:s.snapshot.pendingResult?JSON.parse(serializeProject(s.snapshot.pendingResult.doc)):null,messages:s.snapshot.messages.map(m=>({role:m.role,text:m.text,createdAt:m.createdAt})),composerText:s.snapshot.composerText}));
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
  const r=record({...fresh(),doc,messages,composerText:item.composerText.slice(0,200000)},item.title.slice(0,80)+'（导入）');r.pinned=!!item.pinned;r.moduleKind=item.moduleKind==='asset'?'asset':'scene';r.assetCategory=['设备','人员','工位','仓储','物料','其他'].includes(item.assetCategory)?item.assetCategory:undefined;next.push(r);
  // Pending work is imported as a separate explicitly-labelled recovery project,
  // never silently committed to the original or trusted as an executable batch.
  if(item.draft){const draft=parseProject(JSON.stringify(item.draft));next.push(record({...fresh(),doc:draft},item.title.slice(0,65)+'（未确认草稿副本）'));}
 }
 capture();useWorkspaceStore.setState(w=>({sessions:[...next,...w.sessions]}));schedule();return next.length;
}
