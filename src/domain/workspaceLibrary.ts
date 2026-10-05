import {useEditorStore} from '../store';
import {flushWorkspace,updateLibrarySession,useWorkspaceStore} from '../workspace';
import {assetDocument,createModelAsset} from './modelAssets';
import {saveModelAsset,readModelAsset} from './modelAssetStorage';
export async function saveLibraryProject(thumbnail?:(doc:import('./types').SceneDocument)=>Promise<string>):Promise<string>{
 const w=useWorkspaceStore.getState(),s=useEditorStore.getState(),session=w.sessions.find(x=>x.id===w.activeId&&!x.deletedAt);
 if(!session||!w.ready||w.error)throw Error('工作区尚未就绪或存在保存错误');
 if(['capturing','context','generating','validating','previewing','applying'].includes(s.aiStatus))throw Error('请先结束生成并应用或放弃预览');
 const doc=structuredClone(s.doc),kind=session.moduleKind??'scene';
 if(kind==='scene'){let sceneThumbnail=session.sceneThumbnail;if(thumbnail&&doc.nodes.length)try{sceneThumbnail=await thumbnail(doc);}catch{}
 if(useWorkspaceStore.getState().activeId!==session.id||useEditorStore.getState().doc.revision!==doc.revision)throw Error('保存期间场景发生变化，请重新保存');
 updateLibrarySession(session.id,{moduleKind:'scene',sceneThumbnail,librarySavedAt:Date.now(),savedRevision:doc.revision});await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error(useWorkspaceStore.getState().error!);return '场景已保存到场景库。引用资产版本保持固定。';}
 if(!doc.nodes.length)throw Error('资产还是空的，请先生成或导入模型');
 if(doc.animation?.tracks.length)throw Error('资产库当前保存静态模型；此项目含动画，请保留为场景项目或导出项目备份');
 const source=session.assetSource;const previous=source?await readModelAsset(source.id,source.version):undefined;
 const asset=createModelAsset(doc,doc.nodes.map(n=>n.id),{name:session.title,category:session.assetCategory??'其他',front:previous?.front,...(source?{id:source.id,version:source.version+1}:{})});
 if(thumbnail)try{asset.thumbnail=await thumbnail(assetDocument(asset));}catch{/* Geometry is still saved even if thumbnail rendering is unavailable. */}
 if(useWorkspaceStore.getState().activeId!==session.id||useEditorStore.getState().doc.revision!==doc.revision||useEditorStore.getState().doc.projectId!==doc.projectId||['capturing','context','generating','validating','previewing','applying'].includes(useEditorStore.getState().aiStatus))throw Error('保存期间项目发生变化，请确认当前模型后再保存');
 await saveModelAsset(asset,source?.version??0);
 updateLibrarySession(session.id,{moduleKind:'asset',assetSource:{id:asset.id,version:asset.version},assetCategory:asset.category,librarySavedAt:Date.now(),savedRevision:doc.revision});
 await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('资产版本已保存，但编辑项目的状态保存失败，请到资产库重新打开，避免重复保存');
 return `资产已保存到资产库：${asset.name} v${asset.version}。质量仍待验收。`;
}
