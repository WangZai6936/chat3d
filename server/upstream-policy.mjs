// URL checks shared by the portable server and standalone public-internet Worker.
export function normalizeUpstream(value){
 if(typeof value!=='string'||value.length>2048||/[\s\\]/.test(value))throw Error('API 地址格式无效');
 if(/\/\.{1,2}(\/|$)/.test(value))throw Error('API 根路径不能包含目录跳转');
 let url;try{url=new URL(value);}catch{throw Error('请填写完整 HTTPS API 根地址');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('API 必须使用 HTTPS，不能包含账号、密码、查询参数或片段');
 if(!host.includes('.')||host.endsWith('.')||host.includes(':')||/^[\d.]+$/.test(host)||/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host))throw Error('API 必须使用公网域名，不能使用本机、内网或 IP 字面地址');
 if(!/^[a-z0-9.-]+$/.test(host)||host.split('.').some(p=>!p||p.startsWith('-')||p.endsWith('-')))throw Error('API 域名无效');
 if(!/^\/[a-zA-Z0-9._~/-]*$/.test(url.pathname))throw Error('API 根路径包含不支持的字符');
 return url.href.replace(/\/+$/,'');
}
export function optionalAllowlist(value){return value===undefined||!String(value).trim()?null:String(value).split(',').map(v=>normalizeUpstream(v.trim()));}
