import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createProxyDiagnostics} from '../server/model-proxy-diagnostics.mjs';
import {modelProxyMiddleware} from '../server/node-adapter.mjs';
const encoder=new TextEncoder();let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
const event=obj=>'data: '+JSON.stringify(obj)+'\n\n';
function collect(body,{type='text/event-stream',status=200,step=7,outcome='complete'}={}){
 const logs=[];const monitor=createProxyDiagnostics('/chat/completions',record=>logs.push(record));
 monitor.response(new Response(null,{status,headers:{'content-type':type}}));
 const bytes=encoder.encode(body);for(let i=0;i<bytes.length;i+=step)monitor.observe(bytes.subarray(i,i+step));
 monitor.finish(outcome);return {logs,last:logs.at(-1)};
}
await test('fragmented UTF8 SSE is counted without retaining model content',()=>{
 const body=event({choices:[{delta:{content:'你好'},finish_reason:null}]})+event({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n';
 const {logs,last}=collect(body,{step:1});assert.equal(last.status,200);assert.equal(last.textCharacters,2);assert.equal(last.completionChunks,2);assert.deepEqual(last.finishReasons,['stop']);assert.equal(last.doneMarker,true);assert.equal(last.bytes,encoder.encode(body).length);assert.equal(last.malformedEvents,0);assert.ok(!JSON.stringify(logs).includes('你好'));
});
await test('reasoning-only length exhaustion is distinguishable from tools',()=>{
 const {last}=collect(event({choices:[{delta:{reasoning_content:'PRIVATE_THOUGHT'},finish_reason:'length'}]}));
 assert.equal(last.reasoningCharacters,'PRIVATE_THOUGHT'.length);assert.equal(last.textCharacters,0);assert.equal(last.toolCallDeltas,0);assert.deepEqual(last.finishReasons,['length']);
 const tools=collect(event({choices:[{delta:{tool_calls:[{index:0,function:{name:'edit_scene',arguments:'PRIVATE_ARGS'}}]},finish_reason:'tool_calls'}]}));
 assert.equal(tools.last.toolCallDeltas,1);assert.ok(!JSON.stringify(tools.logs).includes('PRIVATE_ARGS'));assert.ok(!JSON.stringify(tools.logs).includes('edit_scene'));
});
await test('empty completion is not mistaken for malformed or missing SSE',()=>{
 const {last}=collect(event({choices:[{delta:{content:null},finish_reason:'stop'}]})+'data: [DONE]\n\n');
 assert.equal(last.completionChunks,1);assert.equal(last.textCharacters,0);assert.equal(last.toolCallDeltas,0);assert.equal(last.doneMarker,true);
});
await test('Responses API events are classified without logging their output',()=>{
 const {logs,last}=collect(event({type:'response.output_text.delta',delta:'PRIVATE_OUTPUT'})+event({type:'response.completed'}));
 assert.equal(last.responseApiEvents,2);assert.equal(last.completionChunks,0);assert.ok(!JSON.stringify(logs).includes('PRIVATE_OUTPUT'));
});
await test('JSON instead of SSE and error bodies retain only metadata',()=>{
 const json=collect(JSON.stringify({choices:[{message:{content:'PRIVATE_REPLY'},finish_reason:'stop'}]}),{type:'application/json; charset=utf-8'});
 assert.equal(json.last.responseType,'json');assert.equal(json.last.textCharacters,13);assert.ok(!JSON.stringify(json.logs).includes('PRIVATE_REPLY'));
 const denied=collect(JSON.stringify({error:'Bearer PRIVATE_KEY'}),{type:'application/json',status:401});assert.equal(denied.last.hasError,true);assert.equal(denied.last.status,401);assert.ok(!JSON.stringify(denied.logs).includes('PRIVATE_KEY'));
});
await test('comments CRLF multiline events and unfinished final records are supported',()=>{
 const body=': keepalive\r\n\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"abc"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]';
 const {last}=collect(body,{step:3});assert.equal(last.textCharacters,3);assert.equal(last.doneMarker,true);assert.equal(last.malformedEvents,0);
});
await test('malformed events are counted and raw errors never emitted',()=>{
 const {logs,last}=collect('data: NOT_JSON_PRIVATE\n\n'+event({error:{message:'PRIVATE_ERROR'}}));assert.equal(last.malformedEvents,1);assert.equal(last.hasError,true);assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});
await test('oversized SSE records are bounded and later events still diagnosed',()=>{
 const {last}=collect('data: '+JSON.stringify({private:'x'.repeat(100000)})+'\n\n'+event({choices:[{delta:{content:'abc'},finish_reason:'stop'}]})+'data: [DONE]\n\n',{step:1024});
 assert.equal(last.oversizedRecords,1);assert.equal(last.textCharacters,3);assert.equal(last.doneMarker,true);assert.equal(last.malformedEvents,0);
 const json=collect(JSON.stringify({private:'x'.repeat(100000)}),{type:'application/json',step:1024});assert.equal(json.last.oversizedRecords,1);assert.equal(json.last.parsedEvents,0);
});
await test('unknown types and reasons cannot inject private strings into logs',()=>{
 const {logs,last}=collect(event({choices:[{delta:{},finish_reason:'PRIVATE_INJECTION'}]}));assert.deepEqual(last.finishReasons,['other']);assert.ok(!JSON.stringify(logs).includes('PRIVATE_INJECTION'));
 const html=collect('<html>PRIVATE_KEY</html>',{type:'text/html'});assert.equal(html.last.responseType,'html');assert.equal(html.last.parsedEvents,0);assert.ok(!JSON.stringify(html.logs).includes('PRIVATE_KEY'));
});
await test('failed logger never breaks traffic and interrupted reports finish only once',()=>{
 const monitor=createProxyDiagnostics('/SECRET?key=PRIVATE',()=>{throw Error('disk full')});assert.doesNotThrow(()=>{monitor.response(new Response());monitor.observe(encoder.encode('hello'));monitor.finish('complete');});
 const logs=[];const interrupted=createProxyDiagnostics('/chat/completions',r=>logs.push(r));interrupted.finish('interrupted');interrupted.finish('complete');assert.equal(logs.length,2);assert.equal(logs[1].outcome,'interrupted');
});
await test('real Node HTTP streaming remains incremental and byte-identical with safe logs',async()=>{
 const logs=[];let source;const first=event({choices:[{delta:{content:'PRIVATE_BODY'}}]});const last=event({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n';
 const middleware=modelProxyMiddleware({writeDiagnostics:r=>logs.push(r),fetchImpl:async()=>new Response(new ReadableStream({start(c){source=c;c.enqueue(encoder.encode(first));}}),{headers:{'content-type':'text/event-stream','set-cookie':'PRIVATE_COOKIE'}})});
 const server=createServer((req,res)=>middleware(req,res,()=>res.writeHead(404).end()));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/model/chat/completions',{method:'POST',headers:{authorization:'Bearer PRIVATE_KEY','x-chat3d-upstream':'https://example.com/v1','content-type':'application/json'},body:'{"private":"PRIVATE_REQUEST"}'});
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
  const reader=response.body.getReader();const a=await reader.read();assert.equal(new TextDecoder().decode(a.value),first);
  source.enqueue(encoder.encode(last));source.close();let received=first;while(true){const b=await reader.read();if(b.done)break;received+=new TextDecoder().decode(b.value);}assert.equal(received,first+last);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(logs.length,2);assert.equal(logs[1].doneMarker,true);assert.equal(logs[1].outcome,'complete');assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
console.log(`${passed} proxy diagnostic checks passed (no real model requests)`);
