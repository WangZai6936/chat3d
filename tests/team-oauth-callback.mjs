import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/team/sso/callback?code=one-time&state=original-state'});
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
const messages=[];
const channels=new Set();
class Channel {
 constructor(){channels.add(this);}
 postMessage(value){messages.push(value);for(const channel of channels)if(channel!==this)channel.onmessage?.({data:value});}
 close(){channels.delete(this);}
}
Object.defineProperty(globalThis,'BroadcastChannel',{value:Channel,configurable:true});
let exchanges=0,tokenLogins=0;
const requests=[];
const service=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const value=body?JSON.parse(body):undefined;requests.push({url:req.url,value});
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/team/login/sso/code'){
  exchanges++;
  assert.equal(new URL(window.location.href).searchParams.has('code'),false);
  if(exchanges>1){res.statusCode=400;res.end(JSON.stringify({error:'code 不存在'}));return;}
  assert.equal(value.state,'original-state');
  res.end(JSON.stringify({token:'callback-session',user:{name:'Alice',role:'member'},platform:{accessToken:'platform-access',refreshToken:'platform-refresh',expiresTime:1999999999999}}));
 }else if(req.url==='/api/team/login/sso'){
  tokenLogins++;assert.equal(value.accessToken,'platform-access');
  // Keep login in flight while both transports deliver the result.
  await new Promise(resolve=>setTimeout(resolve,20));
  res.end(JSON.stringify({token:'opener-session',user:{name:'Alice',role:'member'}}));
 }else res.end('{}');
});
await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${service.address().port}`;
const callbackVite=await createVite({server:{middlewareMode:true,ws:false},appType:'custom'});
const openerVite=await createVite({server:{middlewareMode:true,ws:false},appType:'custom'});
try{
 const callback=await callbackVite.ssrLoadModule('/src/domain/teamLibrary.ts');
 const oauth=await callbackVite.ssrLoadModule('/src/domain/platformOAuth.ts');
 const opener=await openerVite.ssrLoadModule('/src/domain/teamLibrary.ts');
 window.open=()=>({opener:null});
 const rawCallback=oauth.parsePlatformOAuthCallback();
 window.history.replaceState({},'','/team/');
 const waiting=opener.beginTeamAuthorization({base,timeoutMs:2000});
 await new Promise(resolve=>setTimeout(resolve,0));
 window.history.replaceState({},'','/team/sso/callback?code=one-time&state=original-state');
 const client=await callback.completeTeamOAuthCallbackPage(rawCallback,{base});
 assert.equal(client.user.name,'Alice');
 assert.equal(oauth.parsePlatformOAuthCallback(),undefined);
 assert.deepEqual(messages,[{accessToken:'platform-access',refreshToken:'platform-refresh',expiresTime:1999999999999}]);
 window.dispatchEvent(new window.StorageEvent('storage',{key:'chat3d.platform.oauth.pending',newValue:localStorage.getItem('chat3d.platform.oauth.pending')}));
 window.dispatchEvent(new window.Event('focus'));
 assert.equal((await waiting).user.name,'Alice');
 assert.equal(exchanges,1);assert.equal(tokenLogins,1);
 assert.deepEqual(requests.map(r=>r.url),['/api/team/login/sso/code','/api/team/login/sso']);
 console.log('PASS callback exchanges once with state; opener accepts token delivery across BroadcastChannel/storage/focus without exchanging code');
 await callback.logoutTeamSession();await opener.logoutTeamSession();
 messages.length=0;
 await callback.completeTeamOAuthCallbackPage({accessToken:'platform-access',code:'spent-code',state:'stale-state',refreshToken:'platform-refresh'},{base});
 assert.equal(exchanges,1);assert.equal(tokenLogins,2);
 assert.deepEqual(messages,[{accessToken:'platform-access',refreshToken:'platform-refresh',expiresTime:undefined}]);
 console.log('PASS access token takes precedence over stale code and publication omits code/state');
 await callback.logoutTeamSession();
 await assert.rejects(callback.completeTeamOAuthCallbackPage({error:'denied'},{base}),/denied/);
 await assert.rejects(callback.completeTeamOAuthCallbackPage({},{base}),/缺少令牌或授权码/);
 assert.equal(exchanges,1);
}finally{
 await callbackVite.close();await openerVite.close();
 await new Promise(resolve=>service.close(resolve));dom.window.close();
}
