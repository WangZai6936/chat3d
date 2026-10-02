import {RequirementList} from './RequirementList';
import type {MessageRun} from '../store';
import type {AgentActivity} from '../ai/modelingAgent';
export function RunTrace({run,activity,title,now,onStop,characters}:{run:MessageRun;activity?:AgentActivity|null;title?:string;now:number;onStop?:()=>void;characters?:number}){
 const a=activity??run.activity,active=run.status==='running';
 const status={running:'正在执行',preview:'已生成预览',completed:'本轮已完成',failed:'本轮未完成',stopped:'已停止'}[run.status];
 const end=active?now:run.endedAt??a?.lastEventAt??run.startedAt;
 return <section aria-label="本轮执行过程" className="run-trace my-3 rounded-xl border border-white/10 bg-white/[.025] p-3 text-xs text-gray-400">
  <div className="flex justify-between gap-3"><span role="status" aria-live={active?'polite':'off'} className={active?'text-blue-200':'text-gray-300'}>{active?title??a?.title??'准备执行':status}</span>{active&&onStop&&<button onClick={onStop} className="shrink-0 text-gray-200 hover:text-red-300">停止生成</button>}</div>
  {a?.requirements&&<RequirementList report={a.requirements}/>}
  {!!a?.plan.length&&<details className="mt-2"><summary className="cursor-pointer">执行计划 · {a.plan.length} 步</summary><ol className="mt-2 list-decimal pl-4 space-y-1">{a.plan.map((step,i)=><li key={i}>{step}</li>)}</ol></details>}
  {!!a?.timings.some(t=>t.kind==='tool')&&<details className="mt-2" open={active?true:undefined}><summary className="cursor-pointer">工具执行 · {a.toolCalls} 次</summary><div className="mt-2 space-y-1 max-h-64 overflow-auto">{a.timings.filter(t=>t.kind==='tool').map(t=><div key={t.id} className="rounded bg-black/15 px-2 py-1.5"><div className="flex justify-between gap-2"><span className={t.failed?'text-red-300':'text-gray-300'}>{t.failed?'×':t.endedAt?'✓':active?'◌':'—'} {t.label}</span><span>{t.failed?'失败':t.endedAt?'完成':active?'执行中':'已中断'}</span></div>{t.detail&&<p className="mt-1 whitespace-pre-wrap break-words">{t.detail}</p>}</div>)}</div></details>}
  {!!a?.events.length&&<details className="mt-2"><summary className="cursor-pointer">查看执行摘要</summary><div className="mt-2 max-h-64 overflow-auto space-y-2 select-text">{a.events.map((event,i)=><p key={i} className="break-words">{event}</p>)}</div></details>}
  <div className="mt-2 text-[10px] opacity-70">{Math.max(0,Math.floor((end-run.startedAt)/1000))} 秒{a?` · ${a.turn} 轮`:''}{active&&(characters??a?.characters)?` · 收到 ${characters??a?.characters} 字符`:''}{a?.usageReported?` · ${(a.inputTokens+a.outputTokens).toLocaleString()} Token`:''}</div>
 </section>;
}
