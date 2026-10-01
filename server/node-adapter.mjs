import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {handleModelProxy,proxyError} from './model-proxy.mjs';
export function modelProxyMiddleware({allowed,publicOrigin,fetchImpl}={}){
 return async(req,res,next)=>{
  if(!(req.url??'').split('?')[0].startsWith('/api/model/')){next();return;}
  const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   const host=req.headers.host??'localhost';const localOrigin=publicOrigin??`http://${host}`;
   const request=new Request(new URL(req.url,localOrigin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req),duplex:'half',signal:controller.signal});
   const response=await handleModelProxy(request,{allowed,fetchImpl});res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
   if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
  }catch{if(!res.headersSent&&!res.destroyed){const r=proxyError(502,'PROXY_REQUEST_FAILED','代理请求中断，请检查服务端运行状态');res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}else res.destroy();}
 };
}
export function modelProxyPlugin(allowed){return {name:'chat3d-model-proxy',configureServer(s){s.middlewares.use(modelProxyMiddleware({allowed}));},configurePreviewServer(s){s.middlewares.use(modelProxyMiddleware({allowed}));}};}
