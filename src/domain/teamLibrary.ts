import {teamFetch} from './teamTransport';
import {parseModelAsset,type ModelAssetVersion} from './modelAssets';
import {parseProject,serializeProject} from './project';
import {saveModelAsset} from './modelAssetStorage';
import {createSession,flushWorkspace,useWorkspaceStore} from '../workspace';
import {assertLibraryReady} from './libraryNavigation';
export interface TeamUser {id:string;name:string;role:'admin'|'member'|'viewer'}
export interface TeamItem {id:string;owner:string;kind:'asset'|'scene';version:number;name:string;description:string;created:string}
export interface TeamVersion extends TeamItem {payload:unknown}
export interface TeamPublish {kind:'asset'|'scene';name:string;description:string;payload:unknown;key:string;itemId?:string;expectedVersion:number}
export function teamAddress(value:string){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('请输入 HTTPS 服务根地址（本机测试可用 HTTP localhost）');return url.origin;}
export class TeamClient {
 readonly base:string;private token='';user?:TeamUser;
 constructor(base:string){this.base=teamAddress(base);}
 async request<T>(path:string,body?:unknown):Promise<T>{
  const response=await teamFetch(this.base+'/api/team/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.token?{Authorization:'Bearer '+this.token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000),redirect:'error',credentials:'omit'});
  const data=await response.json();if(!response.ok)throw Error(data.error??'团队服务请求失败');return data as T;
 }
 async login(name:string,password:string){const result=await this.request<{token:string;user:TeamUser}>('login',{name,password});this.token=result.token;this.user=result.user;return result.user;}
 async logout(){try{await this.request('logout',{});}finally{this.token='';this.user=undefined;}}
 list(kind:'asset'|'scene',q=''){return this.request<TeamItem[]>('items?kind='+kind+'&q='+encodeURIComponent(q));}
 read(item:TeamItem){return this.request<TeamVersion>(`items/${item.id}/${item.version}`);}
 publish(body:TeamPublish){return this.request<{id:string;version:number}>('publish',body);}
}
// Explicit allowlist prevents session/chat/settings data from entering a publication.
export function assetPublication(source:ModelAssetVersion):ModelAssetVersion {
 const {format,schemaVersion,id,version,name,category,description,createdAt,unit,upAxis,front,quality,size,nodes,materials,thumbnail,externalConnectionsRemoved,contract}=source;
 return parseModelAsset(JSON.stringify({format,schemaVersion,id,version,name,category,description,createdAt,unit,upAxis,front,quality,size,nodes,materials,thumbnail,externalConnectionsRemoved,contract}));
}
export async function copyTeamVersion(item:TeamVersion){
 assertLibraryReady();
 if(item.kind==='asset'){
  const asset=parseModelAsset(JSON.stringify(item.payload));asset.id=crypto.randomUUID();asset.version=1;asset.name=item.name.slice(0,76)+' 副本';asset.createdAt=new Date().toISOString();
  await saveModelAsset(asset);return asset.id;
 }
 const doc=parseProject(JSON.stringify(item.payload));doc.projectId=crypto.randomUUID();doc.revision=0;
 if(!createSession(doc,{moduleKind:'scene',title:item.name+' 副本',libraryDescription:item.description}))throw Error('无法创建本地副本');
 await flushWorkspace();if(useWorkspaceStore.getState().error)throw Error('副本已创建，但本地保存失败，请先修复存储再继续');return doc.projectId;
}
export function scenePublication(doc:Parameters<typeof serializeProject>[0]){return JSON.parse(serializeProject(doc));}
