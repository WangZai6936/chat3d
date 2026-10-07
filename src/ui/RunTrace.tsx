import {RequirementList} from './RequirementList';
import type {MessageRun} from '../store';
import type {AgentActivity} from '../ai/modelingAgent';
import {customerText,progressSteps} from '../domain/customerProgress';
export function RunTrace({run,activity,title,now,onStop}:{run:MessageRun;activity?:AgentActivity|null;title?:string;now:number;onStop?:()=>void;characters?:number}){
 const a=activity??run.activity,active=run.status==='running',steps=progressSteps(a,active);
 const status={running:'正在处理',preview:'已生成，等待应用',completed:'本次处理已结束',failed:'未能完成',stopped:'已停止'}[run.status];
 const end=active?now:run.endedAt??a?.lastEventAt??run.startedAt;
 return <section aria-label="本轮执行过程" className="customer-run">
  <div className="customer-run-heading"><strong>{active?customerText(title??a?.title):status}</strong><span>{Math.max(0,Math.floor((end-run.startedAt)/1000))} 秒</span>{active&&onStop&&<button onClick={onStop}>停止生成</button>}</div>
  {run.mode==='single'&&<p className="task-footnote">本次为单次生成，没有多轮画面复核。</p>}
  {!!steps.length&&<ol className="customer-steps">{steps.map((s,i)=><li key={i} data-state={s.failed?'failed':s.running?'running':s.completed===s.count?'done':'unfinished'}><span aria-hidden="true">{s.failed?'!':s.running?'◌':s.completed===s.count?'✓':'—'}</span><div><strong>{s.label}</strong><small>{s.failed?'有步骤未完成':s.running?'正在处理':s.completed===s.count?'已完成':'未完成'}{s.count>1?` · ${s.count} 次`:''}</small></div></li>)}</ol>}
  {a?.requirements&&<RequirementList report={a.requirements}/>}
  {!!a?.plan.length&&<details><summary>查看本次安排</summary><ul>{a.plan.map((step,i)=><li key={i}>{customerText(step,'处理模型')}</li>)}</ul><p className="task-footnote">计划不等于完成结果，实际状态以执行记录和预览为准</p></details>}
 </section>;
}
