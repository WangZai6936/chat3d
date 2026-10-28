// Exercise the exact runtime COPY manifest without requiring a Docker daemon.
import assert from 'node:assert/strict';
import {readFile, cp, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, sep} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=await mkdtemp(join(tmpdir(),'chat3d-runtime-'));
let child;
try {
  const dockerfile=await readFile('Dockerfile','utf8');
  const runtime=dockerfile.split(/^FROM .*$/m).at(-1);
  for (const line of runtime.split(/\r?\n/)) {
    const match=/^COPY\s+(?:--from=build\s+)?(\S+)\s+(\S+)\s*$/.exec(line);
    if(!match)continue;
    const source=resolve(match[1].replace(/^\/app\//,'')),target=resolve(root,match[2]);
    assert.ok(source.startsWith(process.cwd()+sep));assert.ok(target.startsWith(root+sep));
    await cp(source,target,{recursive:true});
  }
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const env={...process.env,PORT:String(port),HOST:'127.0.0.1'};
  for(const key of Object.keys(env))if(key.startsWith('CHAT3D_'))delete env[key];
  child=spawn(process.execPath,['server/start.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';child.stderr.on('data',data=>output+=data);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Runtime startup timeout: '+output)),15000);
    child.stdout.on('data',data=>{output+=data;if(output.includes('server ready')){clearTimeout(timer);resolve();}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Runtime exited ${code}: ${output}`));});
  });
  const version=await fetch(`http://127.0.0.1:${port}/api/version`);
  assert.equal(version.status,200);assert.equal((await version.json()).version,JSON.parse(await readFile('package.json','utf8')).version);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);
  console.log('PASS Docker runtime COPY contents start independently and serve the application and version API');
} finally {
  if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'chat3d-runtime-'));
  await rm(root,{recursive:true,force:true});
}
