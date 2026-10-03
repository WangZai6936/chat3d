import {handleModelProxy} from './model-proxy.mjs';
// Build replaces this module with a generated, immutable map of public client files.
import {assets} from 'chat3d-built-assets';
// Standalone Worker: global fetch reaches the public Internet, not private service bindings.
// Do not attach an origin-bypass/VPC transport to this user-configurable proxy.
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/blender/status')return Response.json({available:false,reason:'This hosting environment does not run Blender processes'},{headers:{'cache-control':'no-store'}});
 if(url.pathname.startsWith('/api/blender/'))return Response.json({error:'Blender service is not configured'},{status:503});
 if(url.pathname.startsWith('/api/model/'))return handleModelProxy(request,{allowed:env.CHAT3D_ALLOWED_UPSTREAMS,fetchImpl:(url,init)=>fetch(url,init)});
 if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const path=url.pathname==='/'?'/index.html':url.pathname;
 const asset=assets[path]??(!path.split('/').at(-1).includes('.')?assets['/index.html']:null);
 if(!asset)return new Response('Not found',{status:404});
 const data=asset.base64?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
 return new Response(request.method==='HEAD'?null:data,{headers:{'content-type':asset.type,'cache-control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache','x-content-type-options':'nosniff'}});
}};
