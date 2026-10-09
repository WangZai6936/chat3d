import {openTeam,teamMiddleware} from './team/service.mjs';
import {blenderMiddleware} from './blender/adapter.mjs';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {modelProxyMiddleware} from './node-adapter.mjs';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.webp':'image/webp'};
const proxy=modelProxyMiddleware({allowed:process.env.CHAT3D_ALLOWED_UPSTREAMS,publicOrigin:process.env.CHAT3D_PUBLIC_ORIGIN});
const blender=blenderMiddleware({enabled:process.env.CHAT3D_BLENDER_ENABLED==='1',executable:process.env.BLENDER_EXECUTABLE??'blender',publicOrigin:process.env.CHAT3D_PUBLIC_ORIGIN});
const team=process.env.CHAT3D_TEAM_DB?openTeam(process.env.CHAT3D_TEAM_DB):null;
const sharing=team?teamMiddleware(team,(await import('../dist-team/validator.mjs')).validateTeamPayload,{origins:(process.env.CHAT3D_TEAM_ORIGINS??'').split(',').filter(Boolean)}):(req,res,next)=>next();
const server=createServer((req,res)=>sharing(req,res,()=>blender(req,res,()=>proxy(req,res,async()=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if((pathname.startsWith('/api/')||pathname.startsWith('/server/'))){res.writeHead(404).end();return;}
  let file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return;}
  if(!extname(pathname))file=resolve(root,'index.html');
  if(!(await stat(file)).isFile())throw Error();const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404).end('Not found');}
}))));
server.listen(Number(process.env.PORT??1420),process.env.HOST??'127.0.0.1',()=>console.log('chat3d server ready (model proxy enabled)'));
