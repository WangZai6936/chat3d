import type {fetch as nativeFetch} from '@tauri-apps/plugin-http';
// Match the existing desktop HTTP boundary for configured team endpoints.
// Native requests retain the existing Tauri capability scope and TLS checks.
export function createTeamTransport(
 desktop=()=>Boolean((globalThis as unknown as {__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__),
 loadNative:()=>Promise<{fetch:typeof nativeFetch}>=()=>import('@tauri-apps/plugin-http'),
):typeof fetch {
 return async(input,init)=>{
  if(!desktop())return globalThis.fetch(input,init);
  let native:Awaited<ReturnType<typeof loadNative>>;
  try{native=await loadNative();}catch{throw Error('桌面原生网络插件无法加载，请重新安装完整客户端');}
  try{return await native.fetch(input,{...init,maxRedirections:0,connectTimeout:15000});}
  catch(e){throw e instanceof Error?e:Error(String(e));}
 };
}
export const teamFetch=createTeamTransport();
