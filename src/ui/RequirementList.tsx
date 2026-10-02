import type {RequirementReport} from '../domain/requirements';
export function RequirementList({report}:{report:RequirementReport}){
 if(!report.items.length)return null;
 return <details className="mt-2" open><summary className="cursor-pointer">明确需求核对 · {report.items.length} 项</summary><ul className="mt-2 space-y-2">{report.items.map((r,i)=><li key={i} className="rounded bg-black/15 p-2"><div className={r.status==='pass'?'text-emerald-200':'text-amber-200'}>{r.status==='pass'?'数据符合':r.status==='mismatch'?'发现不符':'待核对'} · {r.quote}</div><p className="mt-1">目标：{r.target} · 期望：{r.expected}</p><p>{r.actual}</p></li>)}</ul><p className="mt-2 opacity-70">模型整理需求，按版本 {report.revision} 的组件名称和几何数据核对；不保证需求提取完整，也不代替视觉与工艺验收</p></details>;
}
