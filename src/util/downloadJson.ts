import {isTauri,invoke} from '@tauri-apps/api/core';
/** Native writes return a verified file path; browser initiation is not proof of saving. */
export async function downloadJson(text:string,kind:'diagnostics'|'workspace'):Promise<string>{
 if(isTauri()){const path=await invoke<string>('save_support_json',{contents:text,kind});return '已保存到：'+path;}
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');
 try{a.href=url;a.download=kind==='diagnostics'?'chat3d-diagnostics.json':'chat3d-workspace.backup.json';document.body.appendChild(a);a.click();return '已发起下载，请检查浏览器下载列表；尚未确认文件落盘。';}
 finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
