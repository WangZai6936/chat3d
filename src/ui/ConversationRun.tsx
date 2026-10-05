import {useEffect,useState} from 'react';
import type {MessageRun} from '../store';
import type {AgentActivity} from '../ai/modelingAgent';
/** User-facing explanations only; diagnostics and tool telemetry stay in TaskPanel. */
export function ConversationRun({run,activity,onStop}:{run:MessageRun;activity?:AgentActivity|null;onStop?:()=>void}){
 const active=run.status==='running';const [expanded,setExpanded]=useState(active);const a=activity??run.activity;
 useEffect(()=>setExpanded(active),[active]);
 const explanations=(a?.explanations??[]).filter(v=>v.text.trim());
 const [now,setNow]=useState(Date.now());useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
 const runningTool=a?.timings.filter(t=>t.kind==='tool'&&!t.endedAt).slice(-1)[0],lastTool=a?.timings.filter(t=>t.kind==='tool').slice(-1)[0];
 const liveStage=runningTool?`正在${runningTool.label}`:a?.title==='正在接收建模工具参数'?'正在接收建模参数':a?.title==='正在接收模型回复'?'正在接收模型说明':'正在等待模型下一步回复';
 const recentTools=a?.timings.filter(t=>t.kind==='tool'&&t.endedAt).slice(-3)??[];
 const label=active?'正在处理':run.status==='failed'?'处理未完成':run.status==='stopped'?'已停止':run.status==='preview'?'修改已生成，等待应用':'处理已结束';
 return <section className="conversation-process" aria-label="思考与执行摘要">
  <div className="conversation-process-heading"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><span aria-hidden="true" className={active?'process-pulse':''}>{active?'◌':'◇'}</span><span>{label} · {expanded?'收起摘要':'查看摘要'}</span><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button>{active&&onStop&&<button type="button" className="process-stop" onClick={onStop}>停止生成</button>}</div>
  {active&&<div className="px-3 py-2 text-xs text-blue-200" role="status" aria-live="polite">{liveStage}<span className="ml-2 text-gray-400">{Math.max(0,Math.floor((now-(runningTool?.startedAt??a?.timings.filter(t=>t.kind==='model').slice(-1)[0]?.startedAt??run.startedAt))/1000))} 秒</span>{lastTool?.failed&&<p className="text-amber-200 mt-1">上一步未成功，正在处理错误；详情见任务记录。</p>}</div>}
  {expanded&&<div className="conversation-process-body" aria-live={active?'polite':'off'}>{explanations.length?explanations.map(e=><p key={e.id}>{e.text}</p>):<p className="process-placeholder">{active?'正在处理你的请求，模型返回说明后会在这里显示。':'这次没有模型过程说明。执行明细可在任务记录查看。'}</p>}{active&&recentTools.length>0&&<ul className="mt-2 text-xs text-gray-400" aria-label="最近执行步骤">{recentTools.map(t=><li key={t.id}>{t.failed?'未完成':'已完成'}：{t.label}</li>)}</ul>}</div>}
 </section>;
}
