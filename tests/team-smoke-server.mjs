// Isolated Windows installer fixture. Never points at CHAT3D_TEAM_DB or user data.
import {createServer} from 'node:http';
import {join} from 'node:path';
import {openTeam,teamMiddleware} from '../server/team/service.mjs';
import {validateTeamPayload} from '../dist-team/validator.mjs';
if(!process.env.CHAT3D_TEAM_SMOKE_DIR)throw Error('Temporary smoke directory required');
const team=openTeam(join(process.env.CHAT3D_TEAM_SMOKE_DIR,'isolated.sqlite'));
const alice=team.provision('smoke-alice','isolated-smoke-password-a');team.provision('smoke-bob','isolated-smoke-password-b');
const asset={format:'chat3d-model-asset',schemaVersion:1,id:'native-fixture',version:1,name:'NativeTestBox',category:'设备',createdAt:new Date().toISOString(),unit:'m',upAxis:'Y',front:'+Z',quality:'unreviewed',size:[1,1,1],externalConnectionsRemoved:0,nodes:[{id:'box',name:'Box',kind:'primitive',parentId:null,visible:true,geometry:{type:'box',params:{width:1,height:1,depth:1}},transform:{position:[0,0,0],scale:[1,1,1],rotationQuaternion:[0,0,0,1]},materialId:'blue'}],materials:[{id:'blue',baseColor:'#3F6BA0',roughness:.5,metalness:.35}]};
team.publish(alice,{kind:'asset',name:asset.name,description:'Isolated installer fixture',payload:asset,key:crypto.randomUUID(),expectedVersion:0},validateTeamPayload);
const middleware=teamMiddleware(team,validateTeamPayload,{origins:['http://tauri.localhost','https://tauri.localhost','tauri://localhost']});
const server=createServer((req,res)=>middleware(req,res,()=>res.writeHead(404).end()));server.listen(1435,'127.0.0.1',()=>console.log('Isolated team fixture ready'));
process.on('SIGTERM',()=>server.close(()=>{team.close();process.exit(0);}));
