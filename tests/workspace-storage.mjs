import assert from 'node:assert/strict';
import {indexedDB,IDBObjectStore} from 'fake-indexeddb';
import {createServer} from 'vite';
globalThis.indexedDB=indexedDB;
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let count=0;const test=async(name,f)=>{await f();console.log('PASS',name);count++};
const dbname='chat3d.workspace.v1';
const seed=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbname,1);r.onupgradeneeded=()=>r.result.createObjectStore('workspace');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({version:1,revision:4,activeId:'a',sessions:[{id:'a',title:'existing',snapshot:{doc:{nodes:[{id:'preserved'}]},messages:[],lastRun:null,pendingBatch:null,pendingResult:null,extra:undefined}}]},'current');tx.oncomplete=()=>{db.close();resolve()}}});
try{
 await seed();const storage=await server.ssrLoadModule('/src/domain/workspaceStorage.ts');let pack=await storage.readWorkspace();
 await test('legacy data migrates atomically without dropping geometry or undefined fields',async()=>{assert.equal(pack.revision,4);await storage.writeWorkspace(pack,4);pack=await storage.readWorkspace();assert.equal(pack.revision,5);assert.equal(pack.sessions[0].snapshot.doc.nodes[0].id,'preserved');assert.ok('extra' in pack.sessions[0].snapshot)});
 await test('progress update writes only changed activity plus small metadata',async()=>{const writes=[];const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){writes.push(key);return original.call(this,value,key)};try{const session=pack.sessions[0];const next={...pack,sessions:[{...session,snapshot:{...session.snapshot,lastRun:{turn:2}}}]};await storage.writeWorkspace(next,pack.revision);assert.deepEqual(writes.sort(),['current',JSON.stringify(['session','a','lastRun'])].sort());pack=await storage.readWorkspace();assert.equal(pack.sessions[0].snapshot.lastRun.turn,2)}finally{IDBObjectStore.prototype.put=original}});
 await test('new geometry and checkpoint persist together and read back unchanged',async()=>{const session=pack.sessions[0];const snap={...session.snapshot,doc:{nodes:[{id:'edited'}]},pendingBatch:{baseRevision:1},pendingResult:{doc:{nodes:[{id:'draft'}]}}};await storage.writeWorkspace({...pack,sessions:[{...session,snapshot:snap}]},pack.revision);pack=await storage.readWorkspace();assert.deepEqual(pack.sessions[0].snapshot,snap)});
 await test('stale writes cannot replace a newer snapshot',async()=>{await assert.rejects(()=>storage.writeWorkspace({...pack,sessions:[]},pack.revision-1),/另一个标签页/);assert.equal((await storage.readWorkspace()).sessions.length,1)});
 await test('older app database version cannot overwrite upgraded storage',async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open(dbname,1);r.onerror=()=>{assert.equal(r.error.name,'VersionError');resolve()};r.onsuccess=()=>{r.result.close();reject(Error('old database reopened'))}})});
 await test('aborted serialization leaves previous revision and data intact',async()=>{const bad={...pack,sessions:[{...pack.sessions[0],snapshot:{...pack.sessions[0].snapshot,lastRun:()=>{}}}]};await assert.rejects(()=>storage.writeWorkspace(bad,pack.revision));const restored=await storage.readWorkspace();assert.equal(restored.revision,pack.revision);assert.deepEqual(restored.sessions,pack.sessions)});
 console.log(`${count} workspace storage checks passed`);
}finally{await server.close()}
