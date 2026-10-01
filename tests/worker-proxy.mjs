import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://discovery-api.intern-ai.org.cn/v1/models');assert.equal(init.headers.Authorization,'Bearer test-only');return new Response('{"data":[{"id":"fixture"}]}',{headers:{'content-type':'application/json'}});};
 const page=await worker.fetch(new Request('https://site.test/'),{});assert.equal(page.status,200);assert.match(await page.text(),/root/);console.log('PASS built Worker serves client HTML without an external assets binding');
 const model=await worker.fetch(new Request('https://site.test/api/model/models',{headers:{authorization:'Bearer test-only','x-chat3d-upstream':'https://discovery-api.intern-ai.org.cn/v1',origin:'https://site.test'}}),{});assert.equal(model.status,200);assert.equal((await model.json()).data[0].id,'fixture');assert.equal(calls,1);console.log('PASS built Worker serves the approved model proxy rather than SPA fallback');
 const missing=await worker.fetch(new Request('https://site.test/api/not-real'),{});assert.equal(missing.status,404);console.log('PASS built Worker does not hide API errors behind HTML');
}finally{globalThis.fetch=original;}
