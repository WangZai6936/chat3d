// Browser-local workspace data only. Credentials are intentionally never part of this payload.
const DB_NAME='chat3d.workspace.v1';
const STORE='workspace';
export interface WorkspaceEnvelope { version:1; revision:number; activeId:string; sessions:unknown[] }
interface SessionRecord {id:string;snapshot:Record<string,unknown>;[key:string]:unknown}
interface Manifest {storageVersion:2;version:1;revision:number;activeId:string;sessions:{metadata:Record<string,unknown>;fields:string[]}[]}
// Identity is used only for objects previously committed/read at the exact revision.
// Editor snapshots are immutable; a failed transaction must never advance this cache.
let committedRevision=-1;
let committed=new Map<string,Record<string,unknown>>();
const fieldKey=(id:string,field:string)=>JSON.stringify(['session',id,field]);
const openDb=():Promise<IDBDatabase>=>new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('当前浏览器不支持会话存储'));return;}
  // Older app tabs cannot reopen/write this upgraded database with version 1.
  const request=indexedDB.open(DB_NAME,2);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('会话数据库被其他页面占用，请关闭旧页面重试'));
});
export async function readWorkspace():Promise<WorkspaceEnvelope|null>{
 const db=await openDb();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),target=tx.objectStore(STORE);let result:WorkspaceEnvelope|null=null;let invalid=false;
  const r=target.get('current');r.onsuccess=()=>{
   const value=r.result as Manifest|WorkspaceEnvelope|undefined;if(!value)return;
   if(!('storageVersion' in value)){result=value;return;}
   if(value.storageVersion!==2){invalid=true;tx.abort();return;}
   const sessions=value.sessions.map(entry=>({...entry.metadata,snapshot:{}} as SessionRecord));
   result={version:value.version,revision:value.revision,activeId:value.activeId,sessions};
   value.sessions.forEach((entry,i)=>{for(const field of entry.fields){const get=target.get(fieldKey(sessions[i].id,field));get.onsuccess=()=>{
    // Undefined fields are stored inside a wrapper, so missing records are detectable.
    if(!get.result||!('value' in get.result)){invalid=true;tx.abort();return;}
    sessions[i].snapshot[field]=get.result.value;
   };}});
  };
  tx.oncomplete=()=>{db.close();if(result){committedRevision=result.revision;committed=new Map((result.sessions as SessionRecord[]).map(s=>[s.id,{...s.snapshot}]));}resolve(result);};
  tx.onabort=()=>{db.close();reject(new Error(invalid?'会话数据不完整，已有数据不会被覆盖，请从项目备份恢复。':'会话读取失败'));};
 });
}
export async function writeWorkspace(data:Omit<WorkspaceEnvelope,'revision'>,expectedRevision:number):Promise<number>{
 const sessions=data.sessions as SessionRecord[];
 if(sessions.some(s=>!s||typeof s.id!=='string'||!s.snapshot||typeof s.snapshot!=='object')||new Set(sessions.map(s=>s.id)).size!==sessions.length)throw Error('会话保存数据无效');
 const db=await openDb();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),target=tx.objectStore(STORE),get=target.get('current');let conflict=false;
  const nextCache=new Map<string,Record<string,unknown>>();
  get.onsuccess=()=>{
   if((get.result?.revision??0)!==expectedRevision){conflict=true;tx.abort();return;}
   const reuse=get.result?.storageVersion===2&&committedRevision===expectedRevision;
   const manifest:Manifest={storageVersion:2,version:1,revision:expectedRevision+1,activeId:data.activeId,sessions:[]};
   for(const session of sessions){
    const {snapshot,...metadata}=session;const previous=reuse?committed.get(session.id):undefined;
    manifest.sessions.push({metadata,fields:Object.keys(snapshot)});
    for(const [field,value] of Object.entries(snapshot))if(!previous||!Object.prototype.hasOwnProperty.call(previous,field)||previous[field]!==value)target.put({value},fieldKey(session.id,field));
    nextCache.set(session.id,{...snapshot});
   }
   // Metadata and changed fields commit atomically; unchanged geometry/history is never cloned.
   target.put(manifest,'current');
  };
  tx.oncomplete=()=>{db.close();committedRevision=expectedRevision+1;committed=nextCache;resolve(expectedRevision+1);};
  tx.onabort=()=>{db.close();reject(new Error(conflict?'另一个标签页已更新会话。请先下载本页项目备份，再刷新；本页不会覆盖其他标签页的数据。':'会话保存失败，可能存储空间不足或浏览器禁止写入。请下载项目备份。'))};
  tx.onerror=()=>{};
 });
}
