import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json; charset=utf-8'};

export function createSpaStatic(root,basePath){
 const base=basePath.endsWith('/')?basePath.slice(0,-1):basePath;
 return async function serveTeamWeb(req,res,pathname){
  if(pathname===base)return redirect(res,base+'/');
  if(!pathname.startsWith(base+'/')&&pathname!==base)return false;
  const rel=pathname.slice(base.length)||'/';
  let file=resolve(root,'.'+rel);
  if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403).end();return true;}
  if(!extname(rel))file=resolve(root,'index.html');
  try{
   if(!(await stat(file)).isFile())throw Error();
  }catch{
   if(extname(rel))return false;
   file=resolve(root,'index.html');
  }
  try{
   const bytes=await readFile(file);
   const cache=rel.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache';
   res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':cache,'X-Content-Type-Options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:bytes);
   return true;
  }catch{return false;}
 };
}

function redirect(res,target){
 res.writeHead(302,{Location:target,'Cache-Control':'no-store'});
 res.end();
}
