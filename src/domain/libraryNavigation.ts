import {createInitialDoc,useEditorStore} from '../store';
import {createSession,switchSession,useWorkspaceStore,type WorkspaceSession} from '../workspace';
import {assetDocument,instantiateAsset,type ModelAssetSummary} from './modelAssets';
import {readModelAsset} from './modelAssetStorage';
import {applyBatch} from './commands';
import {makeId} from '../util/ids';
export function projectIsDraft(s:WorkspaceSession){return !s.librarySavedAt;}
export function projectLabel(s:WorkspaceSession){return s.snapshot.pendingBatch?'待确认预览':!s.librarySavedAt?'草稿':s.savedRevision!==s.snapshot.doc.revision?'有未保存修改':'已保存';}
export function assertLibraryReady(){const s=useEditorStore.getState(),w=useWorkspaceStore.getState();if(!w.ready||w.error||['capturing','context','generating','validating','previewing','applying'].includes(s.aiStatus))throw Error('请先处理当前任务、预览或保存异常');}
export async function openLibraryAsset(item:ModelAssetSummary){assertLibraryReady();const existing=useWorkspaceStore.getState().sessions.filter(s=>!s.deletedAt&&s.moduleKind==='asset'&&s.assetSource?.id===item.id).sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(existing){if(!switchSession(existing.id))throw Error('无法打开编辑项目');return {reused:true};}const asset=await readModelAsset(item.id,item.version);assertLibraryReady();if(!createSession({...assetDocument(asset),projectId:makeId()},{moduleKind:'asset',title:asset.name,assetCategory:asset.category,assetSource:{id:asset.id,version:asset.version}}))throw Error('无法打开资产');return {reused:false};}
export async function createSceneFromAsset(item:ModelAssetSummary,title:string){assertLibraryReady();if(!title.trim())throw Error('请输入场景名称');const asset=await readModelAsset(item.id,item.version);assertLibraryReady();const result=applyBatch(createInitialDoc(),{operations:[instantiateAsset(asset,[0,0,0])]});if(result.errors.length)throw Error(result.errors.map(e=>e.message).join('; '));if(!createSession(result.doc,{moduleKind:'scene',title:title.trim().slice(0,80)}))throw Error('无法新建场景');useEditorStore.setState({dirty:true});}
