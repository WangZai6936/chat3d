import {useEffect,useState} from 'react';
import type {MessageRun} from '../store';
import type {AgentActivity} from '../ai/modelingAgent';
/** User-facing explanations only; diagnostics and tool telemetry stay in TaskPanel. */
export function ConversationRun({run,activity,onStop}:{run:MessageRun;activity?:AgentActivity|null;onStop?:()=>void}){
 const active=run.status==='running';const [expanded,setExpanded]=useState(active);const a=activity??run.activity;
 useEffect(()=>setExpanded(active),[active]);
 const explanations=(a?.explanations??[]).filter(v=>v.text.trim());
 const label=active?'正在处理':run.status==='failed'?'处理未完成':run.status==='stopped'?'已停止':'处理已结束';
 return <section className="conversation-process" aria-label="思考与执行摘要">
  <div className="conversation-process-heading"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><span aria-hidden="true" className={active?'process-pulse':''}>{active?'◌':'◇'}</span><span>{label} · {expanded?'收起摘要':'查看摘要'}</span><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button>{active&&onStop&&<button type="button" className="process-stop" onClick={onStop}>停止生成</button>}</div>
  {expanded&&<div className="conversation-process-body" aria-live={active?'polite':'off'}>{explanations.length?explanations.map(e=><p key={e.id}>{e.text}</p>):<p className="process-placeholder">{active?'正在处理你的请求，模型返回说明后会在这里显示。':'这次没有模型过程说明。执行明细可在任务记录查看。'}</p>}</div>}
 </section>;
}
