import assert from 'node:assert/strict';
import {indexedDB,IDBObjectStore} from 'fake-indexeddb';
import {createServer} from 'vite';
globalThis.indexedDB=indexedDB;
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let count=0;const test=async(name,f)=>{await f();console.log('PASS',name);count++};
const dbname='chat3d.workspace.v1';
const seed=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbname,1);r.onupgradeneeded=()=>r.result.createObjectStore('workspace');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({version:1,revision:4,activeId:'a',sessions:[{id:'a',title:'existing',snapshot:{doc:{nodes:[{id:'preserved'}]},messages:[],lastRun:null,pendingBatch:null,pendingResult:null,extra:undefined}}]},'current');tx.oncomplete=()=>{db.close();resolve()}}});
const fieldKey=(id,field)=>JSON.stringify(['session',id,field]);
const withStore=(mode,run)=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbname,2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace',mode);let result;tx.oncomplete=()=>{db.close();resolve(result)};tx.onabort=()=>{db.close();reject(tx.error??Error('transaction aborted'))};run(tx.objectStore('workspace'),value=>{result=value})}});
const records=()=>withStore('readonly',(store,done)=>{const keys=store.getAllKeys(),values=store.getAll();values.onsuccess=()=>done(keys.result.map((key,i)=>[key,values.result[i]]))});
try{
 await seed();const storage=await server.ssrLoadModule('/src/domain/workspaceStorage.ts');let pack=await storage.readWorkspace();
 await test('legacy data migrates atomically without dropping geometry or undefined fields',async()=>{assert.equal(pack.revision,4);await storage.writeWorkspace(pack,4);pack=await storage.readWorkspace();assert.equal(pack.revision,5);assert.equal(pack.sessions[0].snapshot.doc.nodes[0].id,'preserved');assert.ok('extra' in pack.sessions[0].snapshot)});
 await test('progress update writes only changed activity plus small metadata',async()=>{const writes=[];const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){writes.push(key);return original.call(this,value,key)};try{const session=pack.sessions[0];const next={...pack,sessions:[{...session,snapshot:{...session.snapshot,lastRun:{turn:2}}}]};await storage.writeWorkspace(next,pack.revision);assert.deepEqual(writes.sort(),['current',JSON.stringify(['session','a','lastRun'])].sort());pack=await storage.readWorkspace();assert.equal(pack.sessions[0].snapshot.lastRun.turn,2)}finally{IDBObjectStore.prototype.put=original}});
 await test('new geometry and checkpoint persist together and read back unchanged',async()=>{const session=pack.sessions[0];const snap={...session.snapshot,doc:{nodes:[{id:'edited'}]},pendingBatch:{baseRevision:1},pendingResult:{doc:{nodes:[{id:'draft'}]}}};await storage.writeWorkspace({...pack,sessions:[{...session,snapshot:snap}]},pack.revision);pack=await storage.readWorkspace();assert.deepEqual(pack.sessions[0].snapshot,snap)});
 await test('removing sessions and fields reclaims records and preserves every remaining field',async()=>{
  const session=pack.sessions[0],removed={id:'removed',title:'temporary',snapshot:{doc:{nodes:[{id:'remove-me'}]},messages:[{text:'temporary'}],extra:undefined}};
  await storage.writeWorkspace({...pack,sessions:[session,removed]},pack.revision);pack=await storage.readWorkspace();
  const {extra,...snapshot}=pack.sessions[0].snapshot;const remaining={...pack.sessions[0],snapshot};
  await storage.writeWorkspace({...pack,sessions:[remaining]},pack.revision);pack=await storage.readWorkspace();
  assert.deepEqual(pack.sessions,[remaining]);const keys=(await records()).map(([key])=>key);
  assert.deepEqual(keys.sort(),['current',...Object.keys(snapshot).map(field=>fieldKey(remaining.id,field))].sort());
 });
 await test('the next write sweeps legacy orphans while preserving referenced geometry',async()=>{
  const orphans=[fieldKey('forgotten','doc'),fieldKey('a','obsolete')];
  await withStore('readwrite',store=>{for(const key of orphans)store.put({value:{nodes:[{id:'orphan'}]}},key)});
  const revision=await storage.writeWorkspace(pack,pack.revision);pack={...pack,revision};
  const keys=(await records()).map(([key])=>key);for(const key of orphans)assert.ok(!keys.includes(key));
  assert.deepEqual(await storage.readWorkspace(),pack);
 });
 await test('soft-deleted sessions retain their full snapshots through reclamation',async()=>{
  const recycled={id:'recycled',title:'in trash',deletedAt:123,snapshot:{doc:{nodes:[{id:'restorable'}]},messages:[{text:'keep history'}],lastRun:{turn:3},pendingBatch:{baseRevision:2},pendingResult:{doc:{nodes:[{id:'keep draft'}]}},extra:undefined}};
  await storage.writeWorkspace({...pack,sessions:[...pack.sessions,recycled]},pack.revision);pack=await storage.readWorkspace();
  const active=pack.sessions[0];await storage.writeWorkspace({...pack,sessions:[{...active,snapshot:{...active.snapshot,lastRun:{turn:4}}},pack.sessions[1]]},pack.revision);pack=await storage.readWorkspace();
  assert.deepEqual(pack.sessions[1],recycled);const stored=new Map(await records());
  for(const [field,value] of Object.entries(recycled.snapshot))assert.deepEqual(stored.get(fieldKey(recycled.id,field)),{value});
 });
 await test('stale revisions cannot remove or overwrite newer records',async()=>{const before=await records();await assert.rejects(()=>storage.writeWorkspace({...pack,sessions:[{id:'stale',snapshot:{doc:{nodes:[{id:'wrong'}]}}}]},pack.revision-1),/另一个标签页/);assert.deepEqual(await records(),before);assert.deepEqual(await storage.readWorkspace(),pack)});
 await test('older app database version cannot overwrite upgraded storage',async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open(dbname,1);r.onerror=()=>{assert.equal(r.error.name,'VersionError');resolve()};r.onsuccess=()=>{r.result.close();reject(Error('old database reopened'))}})});
 await test('aborted serialization leaves previous revision and data intact',async()=>{const bad={...pack,sessions:[{...pack.sessions[0],snapshot:{...pack.sessions[0].snapshot,lastRun:()=>{}}}]};await assert.rejects(()=>storage.writeWorkspace(bad,pack.revision));const restored=await storage.readWorkspace();assert.equal(restored.revision,pack.revision);assert.deepEqual(restored.sessions,pack.sessions)});
 await test('aborted reclamation rolls back fields and manifest without advancing the identity cache',async()=>{
  const before=await records(),session=pack.sessions[0],{messages,...snapshot}=session.snapshot;
  const next={...pack,sessions:[{...session,snapshot:{...snapshot,doc:{nodes:[{id:'committed-only-on-retry'}]},newField:{saved:true}}}]};
  const original=IDBObjectStore.prototype.delete;let deletes=0;
  IDBObjectStore.prototype.delete=function(key){const request=original.call(this,key);deletes++;request.onsuccess=()=>this.transaction.abort();return request};
  try{await assert.rejects(()=>storage.writeWorkspace(next,pack.revision),/会话保存失败/)}finally{IDBObjectStore.prototype.delete=original}
  assert.equal(deletes,1);assert.deepEqual(await records(),before);
  // Retry the exact same object identities without a read resetting the cache.
  const revision=await storage.writeWorkspace(next,pack.revision);pack=await storage.readWorkspace();
  assert.equal(pack.revision,revision);assert.deepEqual(pack.sessions,next.sessions);
  assert.deepEqual((await records()).map(([key])=>key).sort(),['current',...Object.keys(next.sessions[0].snapshot).map(field=>fieldKey(session.id,field))].sort());
 });
 console.log(`${count} workspace storage checks passed`);
}finally{await server.close()}
