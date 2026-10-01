// Browser-local workspace data only. Credentials are intentionally never part of this payload.
const DB_NAME='chat3d.workspace.v1';
const STORE='workspace';
export interface WorkspaceEnvelope { version:1; revision:number; activeId:string; sessions:unknown[] }
const openDb=():Promise<IDBDatabase>=>new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('当前浏览器不支持会话存储'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('会话数据库被其他页面占用，请关闭旧页面重试'));
});
export async function readWorkspace():Promise<WorkspaceEnvelope|null>{
  const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();reject(tx.error)}});
}
export async function writeWorkspace(data:Omit<WorkspaceEnvelope,'revision'>,expectedRevision:number):Promise<number>{
  const db=await openDb();return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');const target=tx.objectStore(STORE);const get=target.get('current');let conflict=false;
    get.onsuccess=()=>{if((get.result?.revision??0)!==expectedRevision){conflict=true;tx.abort();return;}target.put({...data,revision:expectedRevision+1},'current');};
    tx.oncomplete=()=>{db.close();resolve(expectedRevision+1)};
    tx.onabort=()=>{db.close();reject(new Error(conflict?'另一个标签页已更新会话。请先下载本页项目备份，再刷新；本页不会覆盖其他标签页的数据。':'会话保存失败，可能存储空间不足或浏览器禁止写入。请下载项目备份。'))};
    tx.onerror=()=>{};
  });
}
