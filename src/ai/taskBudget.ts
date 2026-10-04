/** Per-invocation limits. Token usage is provider-reported, not a billing guarantee. */
export interface TaskBudget { maxMinutes:number; maxRounds:number; maxReportedTokens:number }
export const DEFAULT_TASK_BUDGET:TaskBudget={maxMinutes:30,maxRounds:80,maxReportedTokens:3_000_000};
export function normalizeTaskBudget(value?:Partial<TaskBudget>):TaskBudget {
  const integer=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,Math.floor(v))):fallback;
  return {maxMinutes:integer(value?.maxMinutes,30,1,120),maxRounds:integer(value?.maxRounds,80,1,200),maxReportedTokens:integer(value?.maxReportedTokens,3_000_000,1,20_000_000)};
}
export function taskBudgetReason(budget:TaskBudget,elapsedMs:number,rounds:number,reportedTokens:number,beforeRequest=false):string {
  if(elapsedMs>=budget.maxMinutes*60_000)return `达到本次任务 ${budget.maxMinutes} 分钟上限，已暂停并保留未验收草稿`;
  if(reportedTokens>=budget.maxReportedTokens)return `达到本次任务已报告 ${budget.maxReportedTokens.toLocaleString('en-US')} Token 上限，已暂停并保留未验收草稿；实际费用以服务方为准`;
  if(beforeRequest&&rounds>=budget.maxRounds)return `达到本次任务 ${budget.maxRounds} 轮上限，已暂停并保留未验收草稿`;
  return '';
}
