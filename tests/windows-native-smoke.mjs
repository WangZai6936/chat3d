import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const out=path.resolve('windows-smoke-results');fs.mkdirSync(out,{recursive:true});
const application=process.env.CHAT3D_INSTALLED_EXE;assert.ok(application&&fs.existsSync(application),'Installed Chat3D executable required');
const logs=fs.openSync(path.join(out,'driver.log'),'w');
const driver=spawn(path.join(process.env.USERPROFILE,'.cargo','bin','tauri-driver.exe'),[],{stdio:['ignore',logs,logs]});
let session;const report={application,startedAt:new Date().toISOString(),checks:[],limitations:['No real model service configured','CI graphics are not the user GPU','Native IPC save checks do not cover the diagnostic button after a real generation']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(method,p,body){const r=await fetch('http://127.0.0.1:4444'+p,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});const v=await r.json();if(!r.ok||v.value?.error)throw Error(JSON.stringify(v));return v.value;}
const exec=script=>req('POST',`/session/${session}/execute/sync`,{script,args:[]});
const asyncExec=(script,args=[])=>req('POST',`/session/${session}/execute/async`,{script,args});
async function check(name,fn){const detail=await fn();report.checks.push({name,pass:true,detail});console.log('PASS',name);}
try{
 driver.on('error',e=>{report.driverError=String(e)});
 for(let i=0;i<60;i++){try{await req('GET','/status');break}catch{if(i===59)throw Error('tauri-driver not ready');await sleep(1000)}}
 const created=await req('POST','/session',{capabilities:{alwaysMatch:{browserName:'wry','tauri:options':{application,webviewOptions:{}}}}});session=created.sessionId;assert.ok(session);
 await req('POST',`/session/${session}/timeouts`,{script:30000,implicit:1000,pageLoad:60000});
 await check('installed desktop starts and renders home',async()=>{for(let i=0;i<60;i++){const body=await exec('return document.body.innerText');if(/chat3d/i.test(body)&&body.length>100){fs.writeFileSync(path.join(out,'home.txt'),body);return {title:await exec('return document.title'),textLength:body.length}}await sleep(1000)}throw Error('Home never rendered')});
 fs.writeFileSync(path.join(out,'home.png'),Buffer.from(await req('GET',`/session/${session}/screenshot`),'base64'));
 const invoke=async(contents,kind)=>asyncExec(`const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke('save_support_json',{contents:arguments[0],kind:arguments[1]}).then(path=>done({path}),error=>done({error:String(error)}));`,[contents,kind]);
 const text=JSON.stringify({format:'chat3d-diagnostics-v1',smokeTest:true,message:'中文诊断落盘核验'});let first;
 await check('native diagnostics IPC writes exact bytes on Windows',async()=>{const r=await invoke(text,'diagnostics');assert.ok(r.path,r.error);assert.equal(fs.readFileSync(r.path,'utf8'),text);assert.equal(path.basename(path.dirname(r.path)),'Chat3D');first=r.path;return {path:r.path,bytes:fs.statSync(r.path).size}});
 await check('repeated export creates a distinct file without overwriting',async()=>{const r=await invoke(text,'diagnostics');assert.ok(r.path,r.error);assert.notEqual(r.path,first);assert.equal(fs.readFileSync(first,'utf8'),text);assert.equal(fs.readFileSync(r.path,'utf8'),text);return {path:r.path}});
 await check('workspace backup format writes and invalid requests fail',async()=>{const content=JSON.stringify({format:'chat3d-workspace-backup',smokeTest:true});const r=await invoke(content,'workspace');assert.ok(r.path,r.error);assert.equal(fs.readFileSync(r.path,'utf8'),content);for(const [data,kind]of[['not json','diagnostics'],['{"format":"wrong"}','diagnostics'],[text,'../escape']])assert.ok((await invoke(data,kind)).error);return 'valid backup saved; malformed JSON, format mismatch and invalid kind rejected'});
 await check('asset library navigation renders a real screen',async()=>{const clicked=await exec(`const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='查看全部资产');if(!b)return false;b.click();return true`);assert.equal(clicked,true);for(let i=0;i<20;i++){const body=await exec('return document.body.innerText');if(body.includes('新建资产')){fs.writeFileSync(path.join(out,'library.txt'),body);return true}await sleep(500)}throw Error('Library navigation failed')});
 fs.writeFileSync(path.join(out,'library.png'),Buffer.from(await req('GET',`/session/${session}/screenshot`),'base64'));
 report.pass=true;
}catch(e){report.pass=false;report.error=String(e);if(session){try{fs.writeFileSync(path.join(out,'failure.png'),Buffer.from(await req('GET',`/session/${session}/screenshot`),'base64'));fs.writeFileSync(path.join(out,'failure.txt'),await exec('return document.body.innerText'))}catch{}}process.exitCode=1;console.error(e)}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));if(session)try{await req('DELETE',`/session/${session}`)}catch{}driver.kill();fs.closeSync(logs)}
