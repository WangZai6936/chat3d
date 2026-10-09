import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function openTeam(path){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,head INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS versions(item TEXT NOT NULL REFERENCES items(id),version INTEGER NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,created TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(item,version));
 CREATE TABLE IF NOT EXISTS requests(user TEXT NOT NULL,key TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(user,key));`);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 function provision(name,password,role='member'){
  if(!/^[a-zA-Z0-9_.@-]{1,80}$/.test(name)||typeof password!=='string'||password.length<12||password.length>256||!['admin','member','viewer'].includes(role))fail(400,'账号、角色或密码无效（密码至少12位）');
  const salt=randomBytes(16).toString('hex');const id=randomUUID();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0)').run(id,name,salt,scryptSync(password,salt,64).toString('hex'),role);return {id,name,role};
 }
 const failures=new Map();
 function login(name,password){
  if(typeof name!=='string'||typeof password!=='string'||name.length>80||password.length>256)fail(400,'登录参数无效');
  const now=Date.now();for(const [k,v] of failures)if(v.until<now)failures.delete(k);
  if(failures.size>1000||failures.get(name)?.count>=8)fail(429,'登录尝试过多，请15分钟后重试');
  const u=db.prepare('SELECT * FROM users WHERE name=?').get(name);
  const actual=scryptSync(password,u?.salt??'invalid-user-salt',64);
  if(!u||u.disabled||!timingSafeEqual(actual,Buffer.from(u.password,'hex'))){const old=failures.get(name);failures.set(name,{count:(old?.count??0)+1,until:old?.until??now+900000});fail(401,'账号或密码错误');}
  failures.delete(name);const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(now);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),u.id,now+8*3600000);return {token,user:{id:u.id,name:u.name,role:u.role}};
 }
 function authenticate(token){const u=db.prepare('SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>? AND u.disabled=0').get(hash(token??''),Date.now());if(!u)fail(401,'请重新登录团队服务');return u;}
 function list(kind,query=''){return db.prepare('SELECT i.id,i.owner,i.kind,i.head AS version,v.name,v.description,v.created FROM items i JOIN versions v ON v.item=i.id AND v.version=i.head WHERE i.kind=? AND (instr(lower(v.name),lower(?))>0 OR instr(lower(v.description),lower(?))>0) ORDER BY v.created DESC LIMIT 500').all(kind,query,query);}
 function read(id,version){const row=db.prepare('SELECT i.id,i.owner,i.kind,v.version,v.name,v.description,v.created,v.payload FROM items i JOIN versions v ON v.item=i.id WHERE i.id=? AND v.version=?').get(id,version);if(!row)fail(404,'找不到发布版本');return {...row,payload:JSON.parse(row.payload)};}
 function publish(user,body,validate){
  if(!['admin','member'].includes(user.role))fail(403,'只读成员不能发布');
  const {kind,name,description='',payload,key,itemId,expectedVersion=0}=body;
  if(!['asset','scene'].includes(kind)||typeof name!=='string'||!name.trim()||name.length>80||typeof description!=='string'||description.length>2000||typeof key!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(key)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)fail(400,'发布信息无效');
  validate(kind,payload);
  const digest=hash(JSON.stringify(body));
  return transaction(()=>{
   const old=db.prepare('SELECT * FROM requests WHERE user=? AND key=?').get(user.id,key);if(old){if(old.digest!==digest)fail(409,'重试标识已用于其他内容');return JSON.parse(old.result);}
   const item=itemId?db.prepare('SELECT * FROM items WHERE id=?').get(itemId):null;
   if(itemId&&!item)fail(404,'原件不存在');
   if(item&&item.owner!==user.id&&user.role!=='admin')fail(403,'只有发布者或管理员可以更新原件');
   if(item&&(item.kind!==kind||item.head!==expectedVersion)||!item&&expectedVersion!==0)fail(409,'原件已有新版本，请刷新后重试');
   const id=item?.id??randomUUID(),version=(item?.head??0)+1;
   if(!item)db.prepare('INSERT INTO items VALUES(?,?,?,?)').run(id,user.id,kind,version);else db.prepare('UPDATE items SET head=? WHERE id=?').run(version,id);
   db.prepare('INSERT INTO versions VALUES(?,?,?,?,?,?)').run(id,version,name.trim(),description,new Date().toISOString(),JSON.stringify(payload));
   const result={id,version};db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(user.id,key,digest,JSON.stringify(result));return result;
  });
 }
 return {db,provision,login,authenticate,list,read,publish,logout:token=>db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token??'')),disable:name=>transaction(()=>{db.prepare('UPDATE users SET disabled=1 WHERE name=?').run(name);db.prepare('DELETE FROM sessions WHERE user IN (SELECT id FROM users WHERE name=?)').run(name);}),close:()=>db.close()};
}
export function teamMiddleware(team,validate,{origins=[]}={}){
 return async(req,res,next)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/team/'))return next();
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   const origin=req.headers.origin;
   if(origin){if(!origins.includes(origin))fail(403,'此客户端来源未获允许');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.writeHead(204).end();return;}
   let body;if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'需要JSON');
    let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>22*1024*1024)fail(413,'发布内容超过22MB');parts.push(chunk);}try{body=JSON.parse(Buffer.concat(parts).toString());}catch{fail(400,'JSON无效');}if(!body||typeof body!=='object')fail(400,'请求无效');
   }
   if(req.method==='POST'&&url.pathname==='/api/team/login')return send(200,team.login(body.name,body.password));
   const token=req.headers.authorization?.replace(/^Bearer /,'');const user=team.authenticate(token);
   if(req.method==='GET'&&url.pathname==='/api/team/me')return send(200,user);
   if(req.method==='POST'&&url.pathname==='/api/team/logout'){team.logout(token);return send(200,{ok:true});}
   if(req.method==='GET'&&url.pathname==='/api/team/items')return send(200,team.list(url.searchParams.get('kind'),url.searchParams.get('q')??''));
   const match=url.pathname.match(/^\/api\/team\/items\/([a-zA-Z0-9-]+)\/(\d+)$/);
   if(req.method==='GET'&&match)return send(200,team.read(match[1],Number(match[2])));
   if(req.method==='POST'&&url.pathname==='/api/team/publish')return send(200,team.publish(user,body,validate));
   fail(404,'接口不存在');
  }catch(e){if(!e.status)console.error('team request failed:',e.message);send(e.status??500,{error:e.status?e.message:'服务存储或校验失败，原件未修改；可重试'});}
 };
}
