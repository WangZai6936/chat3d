import {openTeam} from './service.mjs';
if(!process.env.CHAT3D_TEAM_DB)throw Error('Set CHAT3D_TEAM_DB to the persistent database path');
const [action,name,role]=process.argv.slice(2);const team=openTeam(process.env.CHAT3D_TEAM_DB);
try{
 if(action==='add'){let password='';for await(const chunk of process.stdin)password+=chunk;console.log(team.provision(name,password.trimEnd(),role));}
 else if(action==='disable'){team.disable(name);console.log('Account disabled and sessions revoked');}
 else throw Error('Usage: node server/team/admin.mjs add NAME admin|member|viewer (password from stdin), or disable NAME');
}finally{team.close();}
