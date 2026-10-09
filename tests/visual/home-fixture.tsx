// Isolated development-only visual fixture. Not a production entry or real model run.
import React from 'react';import {createRoot} from 'react-dom/client';import App from '../../src/App';import '../../src/index.css';
import {initializeWorkspace,createSession,useWorkspaceStore,getSessionEditor,updateLibrarySession,flushWorkspace} from '../../src/workspace';
import {createInitialDoc} from '../../src/store';import {applyBatch} from '../../src/domain/commands';import {captureSoftware} from '../../src/scene/softwareCapture';
await initializeWorkspace();const ids:string[]=[];
for(const [i,name] of ['机加车间沙盘','潜伏式 AGV','机床操作人员','仓储货架布局'].entries()){
 const doc=applyBatch(createInitialDoc(),{operations:[{op:'createAssembly',name,parts:[{name:'示例模型',geometry:{type:'box',params:{width:1+i*.15,height:.3+i*.15,depth:.8}},materialId:'mat_blue',transform:{position:[0,.3,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]}}]}]}).doc;
 createSession(doc,{title:name,moduleKind:i===0||i===3?'scene':'asset'});const id=useWorkspaceStore.getState().activeId;ids.push(id);updateLibrarySession(id,{sceneThumbnail:await captureSoftware(doc,'perspective')});
}
getSessionEditor(ids[0])!.setState({aiStatus:'generating',composerText:'运行中保留的草稿',lastRun:{title:'正在调整人员姿态',timings:[],events:[],plan:[],toolCalls:0} as any,messages:[{id:'visual-run',role:'user',text:'示例任务，仅用于布局测试',createdAt:Date.now(),run:{startedAt:Date.now()-260000,status:'running'}} as any]});
const second=getSessionEditor(ids[1])!;second.setState({aiStatus:'previewing',pendingBatch:{requestId:'visual-review',projectId:second.getState().doc.projectId,baseRevision:second.getState().doc.revision,operations:[],summary:'示例预览'} as any,pendingResult:{doc:second.getState().doc,applied:[],errors:[]} as any});
await flushWorkspace();createRoot(document.getElementById('root')!).render(<App/>);
