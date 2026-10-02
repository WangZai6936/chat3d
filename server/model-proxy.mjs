// Shared by Vite, Node production and the edge worker. Never stores caller credentials.
import {normalizeUpstream,optionalAllowlist} from './upstream-policy.mjs';
export const MAX_BODY=8*1024*1024;
export function proxyError(status,code,message){return new Response(JSON.stringify({error:{code,message}}),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-chat3d-proxy':'1'}});}
export async function handleModelProxy(request,{allowed,fetchImpl,idleMs=180000}={}){
 const incoming=new URL(request.url),prefix='/api/model';
 const origin=request.headers.get('origin');
 if((origin&&origin!==incoming.origin)||request.headers.get('sec-fetch-site')==='cross-site')return proxyError(403,'PROXY_ORIGIN_DENIED','代理仅接受同源页面请求');
 if(incoming.pathname===prefix+'/health'&&request.method==='GET')return new Response(JSON.stringify({ok:true,transport:'same-origin-proxy'}),{headers:{'content-type':'application/json','x-chat3d-proxy':'1','cache-control':'no-store'}});
 const endpoint=incoming.pathname.slice(prefix.length);
 if(!incoming.pathname.startsWith(prefix+'/')||incoming.search||!['/models','/chat/completions'].includes(endpoint))return proxyError(404,'PROXY_ROUTE_NOT_FOUND','不支持的代理接口');
 if(request.method!==(endpoint==='/models'?'GET':'POST'))return proxyError(405,'PROXY_METHOD_DENIED','接口请求方法不正确');
 const authorization=request.headers.get('authorization')??'';
 if(!/^Bearer\s+\S+$/i.test(authorization)||authorization.length>8192)return proxyError(401,'PROXY_KEY_REQUIRED','请填写有效的 API Key');
 let roots;try{roots=optionalAllowlist(allowed);}catch{return proxyError(503,'PROXY_CONFIG_INVALID','服务端代理允许地址配置无效，请联系部署管理员');}
 let base;try{base=normalizeUpstream(request.headers.get('x-chat3d-upstream'));}catch(e){return proxyError(400,'PROXY_UNSAFE_ADDRESS',e.message);}
 if(new URL(base).hostname===incoming.hostname)return proxyError(400,'PROXY_SELF_TARGET','API 地址不能指向当前应用自身');
 if(roots&&!roots.includes(base))return proxyError(403,'PROXY_UPSTREAM_DENIED','此部署启用了管理员限定的 API 列表，该地址不在限定范围内；默认部署支持安全的自定义公网 HTTPS API');
 if(Number(request.headers.get('content-length'))>MAX_BODY)return proxyError(413,'PROXY_BODY_TOO_LARGE','请求超过 8 MB，请减少参考图或上下文');
 if(request.method==='POST'&&!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return proxyError(415,'PROXY_JSON_REQUIRED','生成请求必须是 JSON');
 const controller=new AbortController();let timer;const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),idleMs);};
 const abort=()=>controller.abort(request.signal.reason);request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const cleanup=()=>{clearTimeout(timer);request.signal.removeEventListener('abort',abort);};touch();
 try{
  let body;
  if(request.method==='POST'){
   const reader=request.body?.getReader(),chunks=[];let size=0;
   if(reader){const stop=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',stop,{once:true});try{while(true){if(controller.signal.aborted)throw Error('Aborted');const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();cleanup();return proxyError(413,'PROXY_BODY_TOO_LARGE','请求超过 8 MB，请减少参考图或上下文');}chunks.push(value);touch();}}finally{controller.signal.removeEventListener('abort',stop);reader.releaseLock();}}
   body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.byteLength;}
  }
  if(controller.signal.aborted)throw Error('Aborted');
  if(!fetchImpl){cleanup();return proxyError(503,'PROXY_TRANSPORT_MISSING','服务端未配置安全网络通道');}
  const response=await fetchImpl(base+endpoint,{method:request.method,headers:{Authorization:authorization,...(request.method==='POST'?{'Content-Type':'application/json'}:{}),Accept:request.headers.get('accept')??'application/json'},body,signal:controller.signal,redirect:'manual'});
  if(response.status>=300&&response.status<400){await response.body?.cancel();cleanup();return proxyError(502,'PROXY_REDIRECT_BLOCKED','上游返回重定向，请配置最终 API 根地址；代理不会将密钥转发到其他地址');}
  const headers=new Headers({'content-type':response.headers.get('content-type')??'application/json','cache-control':'no-store','x-chat3d-proxy':'1','x-accel-buffering':'no'});
  if(!response.body){cleanup();return new Response(null,{status:response.status,headers});}
  const reader=response.body.getReader();touch();
  const stream=new ReadableStream({async pull(c){try{const {done,value}=await reader.read();if(done){cleanup();c.close();return;}touch();c.enqueue(value);}catch(e){cleanup();c.error(e);}},async cancel(reason){controller.abort();cleanup();await reader.cancel(reason);}});
  return new Response(stream,{status:response.status,headers});
 }catch(error){cleanup();if(['PROXY_UNSAFE_ADDRESS','PROXY_DNS_FAILED'].includes(error?.code))return proxyError(400,error.code,error.message);return proxyError(controller.signal.aborted?504:502,controller.signal.aborted?'PROXY_TIMEOUT':'PROXY_UPSTREAM_UNREACHABLE',controller.signal.aborted?'代理请求已取消或上游连续 3 分钟无响应':'代理服务无法连接上游，请检查服务端网络、证书或上游可用性；这不是浏览器跨域错误');}
}
