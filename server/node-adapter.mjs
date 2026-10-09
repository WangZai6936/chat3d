import {publicHttpsFetch} from './public-https.mjs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {handleModelProxy,proxyError} from './model-proxy.mjs';
import {createProxyDiagnostics} from './model-proxy-diagnostics.mjs';
export function modelProxyMiddleware({allowed,publicOrigin,fetchImpl,writeDiagnostics}={}){
 return async(req,res,next)=>{
  if(!(req.url??'').split('?')[0].startsWith('/api/model/')){next();return;}
  const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  const diagnostics=createProxyDiagnostics((req.url??'').split('?')[0].slice('/api/model'.length),writeDiagnostics);let complete=false;
  try{
   const host=req.headers.host??'localhost';const localOrigin=publicOrigin??`http://${host}`;
   const request=new Request(new URL(req.url,localOrigin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req),duplex:'half',signal:controller.signal});
   const response=await handleModelProxy(request,{allowed,fetchImpl:fetchImpl??publicHttpsFetch});diagnostics.response(response);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
   if(response.body)await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,callback){diagnostics.observe(chunk);callback(null,chunk);}}),res);else res.end();complete=true;
  }catch{if(!res.headersSent&&!res.destroyed){const r=proxyError(502,'PROXY_REQUEST_FAILED','代理请求中断，请检查服务端运行状态');res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}else res.destroy();}
  finally{diagnostics.finish(complete?'complete':'interrupted');}
 };
}
export function modelProxyPlugin(allowed){return {name:'chat3d-model-proxy',configureServer(s){s.middlewares.use(modelProxyMiddleware({allowed}));},configurePreviewServer(s){s.middlewares.use(modelProxyMiddleware({allowed}));}};}
