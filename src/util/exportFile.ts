import {isTauri,invoke} from '@tauri-apps/api/core';

/** Null means the native picker was cancelled; browser downloads are not verified writes. */
export async function exportFile(contents:string|ArrayBuffer,kind:'html'|'glb'|'json',filename:string):Promise<string|null>{
 if(isTauri()){
  const bytes=typeof contents==='string'?new TextEncoder().encode(contents):new Uint8Array(contents);
  const path=await invoke<string|null>('save_export_file',{contents:Array.from(bytes),kind,filename});
  return path===null?null:'已保存到：'+path;
 }
 const type={html:'text/html;charset=utf-8',glb:'model/gltf-binary',json:'application/json'}[kind];
 const url=URL.createObjectURL(new Blob([contents],{type}));
 const link=document.createElement('a');
 try{link.href=url;link.download=filename;document.body.appendChild(link);link.click();return '已发起下载，请检查浏览器下载';}
 finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
