import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {Readable} from 'node:stream';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import ipaddr from 'ipaddr.js';
import {normalizeUpstream} from './upstream-policy.mjs';
const policyError=message=>Object.assign(Error(message),{code:'PROXY_UNSAFE_ADDRESS'});
export function isPublicAddress(address){try{const parsed=ipaddr.process(address);return parsed.range()==='unicast'&&parsed.toString()!=='168.63.129.16';}catch{return false;}}
export async function resolvePublicAddresses(hostname,resolver=lookup){
 let addresses;try{addresses=await resolver(hostname,{all:true,verbatim:true});}catch{throw Object.assign(Error('API 域名解析失败，请检查域名或服务端 DNS'),{code:'PROXY_DNS_FAILED'});}
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>![4,6].includes(a.family)||!isPublicAddress(a.address)))throw policyError('API 域名解析到了本机、内网或保留地址，代理已拒绝连接');
 return addresses.sort((a,b)=>a.family-b.family);
}
export function pinnedLookup(addresses){return (_hostname,options,callback)=>{if(options?.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);};}
// Resolve once, validate ALL answers, pin TLS connection to those exact addresses.
// TLS verifies the original hostname; no insecure certificate bypass or redirect following.
export async function publicHttpsFetch(url,init={},dependencies={}){
 const parsed=new URL(url);normalizeUpstream(parsed.origin+parsed.pathname);
 const addresses=await resolvePublicAddresses(parsed.hostname,dependencies.lookup??lookup);
 if(init.signal?.aborted)throw init.signal.reason??Error('Aborted');
 return new Promise((resolve,reject)=>{
  const req=(dependencies.request??httpsRequest)(parsed,{method:init.method??'GET',headers:{...init.headers,'Accept-Encoding':'identity'},lookup:pinnedLookup(addresses),servername:parsed.hostname,agent:false,rejectUnauthorized:true,signal:init.signal},response=>{
   const headers=new Headers();for(const [name,value] of Object.entries(response.headers))if(value!==undefined&&name!=='set-cookie')headers.set(name,Array.isArray(value)?value.join(', '):value);
   let stream=response;const encoding=headers.get('content-encoding');const decompressor=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
   if(decompressor){response.on('error',error=>decompressor.destroy(error));stream=response.pipe(decompressor);headers.delete('content-encoding');headers.delete('content-length');}
   const status=response.statusCode??502;
   if([204,205,304].includes(status)){response.resume();resolve(new Response(null,{status,headers}));return;}
   resolve(new Response(Readable.toWeb(stream),{status,headers}));
  });
  req.once('error',reject);req.end(init.body);
 });
}
