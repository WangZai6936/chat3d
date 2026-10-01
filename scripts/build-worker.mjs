import {readFile,readdir} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {build} from 'vite';
const assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.webp':'image/webp'};
async function collect(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='server'||e.name.endsWith('.map'))continue;const path=join(dir,e.name),key=prefix+'/'+e.name;if(e.isDirectory())await collect(path,key);else{const data=await readFile(path),text=['.html','.js','.css','.svg','.txt','.json'].includes(extname(e.name));assets[key]={type:types[extname(e.name)]??'application/octet-stream',body:data.toString(text?'utf8':'base64'),base64:!text};}}}
await collect('dist');
await build({configFile:false,plugins:[{name:'embedded-public-assets',resolveId(id){if(id==='chat3d-built-assets')return '\0chat3d-built-assets';},load(id){if(id==='\0chat3d-built-assets')return 'export const assets='+JSON.stringify(assets)+';';}}],build:{ssr:'server/worker.mjs',outDir:'dist/server',emptyOutDir:true,minify:true,rollupOptions:{output:{entryFileNames:'index.js'}}}});
