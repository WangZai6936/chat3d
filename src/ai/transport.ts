// Web calls the application's own server; desktop uses its native HTTP plugin.
// Resolve the host fetch at request time: embedded hosts may replace their
// authentication-aware wrapper after a session refresh. Never retain the first wrapper.
export function createBrowserProxyFetch(network:typeof fetch=(input,init)=>globalThis.fetch(input,init)):typeof fetch {
 return async(input,init)=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,globalThis.location?.origin);
  const endpoint=url.pathname.endsWith('/chat/completions')?'/chat/completions':url.pathname.endsWith('/models')?'/models':null;
  if(!endpoint||url.search||url.hash||url.username||url.password||url.protocol!=='https:')throw new Error('模型 API 地址需为 HTTPS 根地址，且不能包含账号、查询参数或片段');
  const base=url.origin+url.pathname.slice(0,-endpoint.length).replace(/\/+$/,'');
  const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));headers.set('X-Chat3d-Upstream',base);
  const method=init?.method??(input instanceof Request?input.method:'GET');
  const body=init?.body??(input instanceof Request&&!['GET','HEAD'].includes(method)?await input.arrayBuffer():undefined);
  let response:Response;
  try{response=await network('/api/model'+endpoint,{method,headers,body,signal:init?.signal??(input instanceof Request?input.signal:undefined),credentials:'same-origin',redirect:'error',cache:'no-store'});}catch(error){
   if(init?.signal?.aborted||(input instanceof Request&&input.signal.aborted))throw error;
   throw new Error(globalThis.navigator?.onLine===false?'浏览器当前离线，尚未取得本站模型代理响应。请恢复网络后重试；原场景已保留':'浏览器未能取得本站模型代理响应，可能是连接中断、访问会话失效或请求被拦截。请检查网络并重新打开页面；不要反复提交以免重复计费');
  }
  if(response.headers.get('x-chat3d-proxy')!=='1'&&(response.status===401||response.status===403))throw new Error(`体验页访问验证未通过（HTTP ${response.status}），请求未进入模型代理。这不是已确认的模型 Key 错误。请在独立标签页重新打开体验页并完成登录，保留当前场景后再继续；无需重装或重新部署`);
  if(response.headers.get('x-chat3d-proxy')!=='1')throw new Error(`本站模型代理响应异常（HTTP ${response.status}，${(response.headers.get('content-type')??'未知类型').split(';')[0]}）。当前网页未接入模型代理，或登录/访问会话已失效。开发环境请更新代码并重启 npm run dev；网页部署请使用 npm start 或配套 Worker，不能只部署静态 dist 文件`);
  if(!response.ok){const data=await response.clone().json().catch(()=>null);if(typeof data?.error?.code==='string'&&data.error.code.startsWith('PROXY_'))throw new Error(data.error.message);}
  return response;
 };
}
