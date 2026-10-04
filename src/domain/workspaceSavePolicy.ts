/** Running progress is expendable between checkpoints; edits and user input are not. */
export function progressOnlyChange(s:any,p:any):boolean{
 if(s.aiStatus!=='generating'||p.aiStatus!==s.aiStatus)return false;
 const stable=['doc','pendingBatch','pendingResult','past','future','dirty','composerText','composerImages'];
 if(stable.some(k=>s[k]!==p[k]))return false;
 if(s.messages===p.messages)return s.lastRun!==p.lastRun;
 if(s.messages.length!==p.messages.length)return false;
 return s.messages.every((m:any,i:number)=>{const old=p.messages[i];if(m===old)return true;return m.id===old.id&&m.text===old.text&&m.images===old.images&&m.batch===old.batch&&m.error===old.error&&m.outcome===old.outcome&&m.steering===old.steering&&m.queuedTask===old.queuedTask&&m.run?.status==='running'&&old.run?.status==='running'&&m.run?.startedAt===old.run?.startedAt;});
}
