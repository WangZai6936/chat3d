// Web calls the application's own server; desktop uses its native HTTP plugin.
export function createBrowserProxyFetch(network:typeof fetch):typeof fetch {
 return async(input,init)=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,globalThis.location?.origin);
  const endpoint=url.pathname.endsWith('/chat/completions')?'/chat/completions':url.pathname.endsWith('/models')?'/models':null;
  if(!endpoint||url.search||url.hash||url.username||url.password||url.protocol!=='https:')throw new Error('模型 API 地址需为 HTTPS 根地址，且不能包含账号、查询参数或片段');
  const base=url.origin+url.pathname.slice(0,-endpoint.length).replace(/\/+$/,'');
  const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));headers.set('X-Chat3d-Upstream',base);
  const method=init?.method??(input instanceof Request?input.method:'GET');
  const body=init?.body??(input instanceof Request&&!['GET','HEAD'].includes(method)?await input.arrayBuffer():undefined);
  const response=await network('/api/model'+endpoint,{method,headers,body,signal:init?.signal??(input instanceof Request?input.signal:undefined),credentials:'same-origin',redirect:'error',cache:'no-store'});
  if(response.headers.get('x-chat3d-proxy')!=='1')throw new Error('当前网页未接入模型代理。开发环境请更新代码并重启 npm run dev；网页部署请使用 npm start 或配套 Worker，不能只部署静态 dist 文件');
  if(!response.ok){const data=await response.clone().json().catch(()=>null);if(typeof data?.error?.code==='string'&&data.error.code.startsWith('PROXY_'))throw new Error(data.error.message);}
  return response;
 };
}
