export interface EditPayload {summary:string;operations:unknown[]}
export interface FieldCorrection {path:(string|number)[];value:unknown}
export class FailedEditBuffer {
 private entry:{id:string;revision:number;scope:string;payload:EditPayload;attempts:number}|null=null;
 remember(id:string,revision:number,scope:string,payload:EditPayload){if(JSON.stringify(payload).length>2_000_000){this.entry=null;return false;}this.entry={id,revision,scope,payload:structuredClone(payload),attempts:0};return true;}
 clear(){this.entry=null;}
 correct(id:string,revision:number,scope:string,patches:FieldCorrection[]):EditPayload{
  const e=this.entry;if(!e||e.id!==id)throw Error('失败批次不存在或已失效');if(e.revision!==revision||e.scope!==scope)throw Error('场景或任务要求已变化，不能重放旧批次');if(e.attempts>=2)throw Error('该失败批次已达到两次纠错上限，请重新组织合法命令');
  if(!Array.isArray(patches)||!patches.length||patches.length>8)throw Error('需要1–8处字段纠正');
  const next=structuredClone(e.payload);
  for(const p of patches){if(!Array.isArray(p.path)||p.path.length<3||p.path.length>12||p.path[0]!=='operations'||p.path.some(k=>typeof k==='string'?['__proto__','constructor','prototype'].includes(k):typeof k!=='number'||!Number.isSafeInteger(k)||k<0)||JSON.stringify(p.value)?.length>20000)throw Error('纠错路径或值无效');let node:any=next;
   for(const key of p.path.slice(0,-1)){if(node===null||typeof node!=='object'||!Object.prototype.hasOwnProperty.call(node,key))throw Error('纠错路径不存在');node=node[key];}
   const last=p.path[p.path.length-1];if(node===null||typeof node!=='object'||Array.isArray(node)&&(!Number.isInteger(last)||Number(last)>=node.length))throw Error('不能通过纠错追加或删除数组元素');node[last]=structuredClone(p.value);
  }
  e.attempts++;e.payload=next;return structuredClone(next);
 }
}
