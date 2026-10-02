import {RunTrace} from './RunTrace';
import {useEffect,useState} from 'react';
import {useEditorStore} from '../store';
import {CheckCircledIcon,ClockIcon,ActivityLogIcon,CrossCircledIcon} from '@radix-ui/react-icons';
export function TaskPanel({onConversation}:{onConversation:()=>void}){
 const {lastRun,aiStatus,pendingBatch,pendingResult,doc,messages}=useEditorStore();
 const busy=['capturing','context','generating','validating','applying'].includes(aiStatus);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[busy]);
 const runs=messages.filter(m=>m.run).slice().reverse();
 const latestRun=runs[0]?.run;
 const latestReply=[...messages].reverse().find(m=>m.role==='assistant');
 const hasHistory=!!lastRun||!!latestRun||messages.some(m=>m.batch);
 const modeTitle=latestRun?.mode==='demo'?'离线演示':latestRun?.mode==='single'?'单次生成':'本轮任务';
 const idleTitle=latestRun?.status==='failed'?'最近任务未完成':latestRun?.status==='stopped'?'最近任务已停止':hasHistory?`${modeTitle}已结束 · 当前无运行任务`:'用一句话开始建模';
 const outcomes=messages.filter(m=>m.batch).slice().reverse();
 return <section className="task-panel" aria-label="任务记录">
 <div className="task-panel-intro"><ActivityLogIcon/><h2>任务与执行记录</h2><p>查看当前进展、执行用量和场景修改结果</p></div>
 <div className={`task-current ${busy?'is-running':''}`}><div className="task-eyebrow"><span className="status-dot"/>{busy?'正在执行':pendingBatch?'等待你的确认':aiStatus==='error'?'执行遇到问题':aiStatus==='cancelled'?'已停止':hasHistory?'当前无运行任务':'尚未开始任务'}</div><h3>{busy?lastRun?.title??'正在处理请求':pendingBatch?'预览已保留，等待你的决定':idleTitle}</h3><p>{pendingBatch?'场景仍是预览，确认应用后才会写入项目':busy?'可回到对话查看进展或停止生成':hasHistory?(latestReply?.text.split('\n')[0].slice(0,160)??'可展开下方记录查看结果'):'每次修改先预览，再由你决定是否应用'}</p><button onClick={onConversation}>{pendingBatch?'返回对话确认预览':busy?'返回对话 / 停止生成':'前往对话'}</button></div>
 {lastRun&&<><div className="task-metrics"><div><strong>{lastRun.turn}</strong><span>模型轮次</span></div><div><strong>{lastRun.toolCalls}</strong><span>工具调用</span></div><div><strong>{lastRun.usageReported?(lastRun.inputTokens+lastRun.outputTokens).toLocaleString():'—'}</strong><span>Token 用量</span></div></div>
 {!!lastRun.plan.length&&<div className="task-section"><h3>执行计划</h3><ol>{lastRun.plan.map((step,i)=><li key={i}><span>{i+1}</span>{step}</li>)}</ol><p className="task-footnote">计划不等于完成结果，实际状态以执行记录和预览为准</p></div>}
 {lastRun.design&&<details className="task-section"><summary>设计方案 · {lastRun.design.equipment.length} 类设备</summary><div className="task-events"><p>工艺：{lastRun.design.flow.join(' → ')}</p><p>布局：{lastRun.design.layout}</p>{lastRun.design.equipment.map((e,i)=><p key={i}>{e.name} × {e.count}：{e.features.join('、')}</p>)}<p>检查标准：{lastRun.design.checks.join('；')}</p>{lastRun.design.composition&&<><p>分区：{lastRun.design.composition.zones.map(z=>z.name+'：'+z.purpose).join('；')}</p><p>连接：{lastRun.design.composition.connections.map(c=>c.from+' → '+c.to+'（'+c.via+'）').join('；')}</p><p>配套：{lastRun.design.composition.support.map(e=>e.name+' × '+e.count+'：'+e.purpose).join('；')}</p><p>观感：{lastRun.design.composition.palette.join('、')}；{lastRun.design.composition.presentation}</p></>}</div></details>}
 {lastRun.quality&&<details className="task-section"><summary>场景检查 · {lastRun.quality.issues.length} 项待核对</summary><div className="task-events"><p>检查版本 {lastRun.quality.revision} · {lastRun.quality.componentCount} 个组件{(pendingResult?.doc.revision??doc.revision)!==lastRun.quality.revision?' · 场景已变化，检查可能已过期':''}</p>{lastRun.quality.coverage.map((c,i)=><p key={i}>{c.name}：已关联 {c.actual} / 计划 {c.expected}</p>)}{lastRun.quality.issues.map((issue,i)=><p key={i}>{issue}</p>)}<p>仅为清单和几何线索，仍需核对画面与工艺合理性</p></div></details>}
 <div className="task-section"><h3>执行时间线</h3>{lastRun.timings.length?lastRun.timings.map(t=><div className="task-timeline-item" key={t.id}>{t.failed?<CrossCircledIcon color="#e69f95"/>:t.endedAt!==undefined?<CheckCircledIcon/>:<ClockIcon/>}<div><strong>{t.label}</strong><span>{((Math.max(t.endedAt??(busy?now:lastRun.lastEventAt),t.startedAt)-t.startedAt)/1000).toFixed(1)} 秒 · {t.failed?'失败':t.endedAt!==undefined?'已结束':busy?'进行中':'已中断'}</span></div></div>):<p>暂未记录耗时</p>}</div>
 <details className="task-section"><summary>详细活动 · {lastRun.events.length} 条</summary><div className="task-events">{lastRun.events.map((event,i)=><p key={i}>{event}</p>)}</div></details></>}
 <div className="task-section"><h3>逐轮执行历史</h3>{runs.map(m=><details key={m.id} className="mt-2"><summary className="cursor-pointer text-sm">{m.text.slice(0,90)}</summary><RunTrace run={m.run!} now={now}/></details>)}</div>
 <div className="task-section"><h3>本会话的修改记录 <span>{outcomes.length}</span></h3>{outcomes.length?outcomes.map(m=><div className="task-outcome" key={m.id}><span className={`outcome-label ${m.outcome??'preview'}`}>{m.outcome==='applied'?'已应用':m.outcome==='discarded'?'已放弃':m.outcome==='superseded'?'已合并到后续预览':pendingBatch?.requestId===m.batch?.requestId?'待确认':'预览已结束'}</span><p>{m.batch?.summary||m.text}</p><small>{m.batch?.operations.length} 项操作 · {new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>):<p className="task-footnote">还没有场景修改记录。完成一次生成后会在这里显示</p>}</div>
 </section>;
}
