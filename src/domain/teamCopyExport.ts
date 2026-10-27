import {parseModelAsset} from './modelAssets';
import {parseProject,serializeProject} from './project';
import type {TeamVersion} from './teamLibrary';

/** Desktop/Web handoff: new ids so imports never overwrite local originals. */
export function buildTeamCopyExport(item:TeamVersion):string{
 if(item.kind==='asset'){
  const asset=parseModelAsset(JSON.stringify(item.payload));
  asset.id=crypto.randomUUID();
  asset.version=1;
  asset.name=item.name.slice(0,76)+' 副本';
  asset.createdAt=new Date().toISOString();
  return JSON.stringify(asset);
 }
 const doc=parseProject(JSON.stringify(item.payload));
 doc.projectId=crypto.randomUUID();
 doc.revision=0;
 return serializeProject(doc);
}

export function teamCopyFilename(item:TeamVersion):string{
 const stem=item.name.replace(/[^\w\u4e00-\u9fff.-]+/g,'_').slice(0,48)||'team-item';
 return item.kind==='asset'?`scenivo-team-asset-${stem}-v${item.version}.json`:`scenivo-team-scene-${stem}-v${item.version}.chat3d.json`;
}

export function downloadTeamCopyFile(item:TeamVersion):string{
 const text=buildTeamCopyExport(item);
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 const a=document.createElement('a');
 try{
  a.href=url;
  a.download=teamCopyFilename(item);
  document.body.appendChild(a);
  a.click();
  return '已发起下载。在桌面端：资产库 → 模型资产库可导入资产 JSON；工作台 → 打开项目可导入场景文件。';
 }finally{
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
