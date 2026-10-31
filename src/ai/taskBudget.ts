/** Per-invocation limits. Token usage is provider-reported, not a billing guarantee. */
export interface TaskBudget { maxMinutes:number; maxRounds:number; maxReportedTokens:number }
export const TASK_BUDGET_PRESETS = {
  small: {maxMinutes:5,maxRounds:12,maxReportedTokens:150_000},
  standard: {maxMinutes:10,maxRounds:24,maxReportedTokens:2_000_000},
  extended: {maxMinutes:30,maxRounds:80,maxReportedTokens:3_000_000},
} as const;
export const DEFAULT_TASK_BUDGET:TaskBudget={...TASK_BUDGET_PRESETS.standard};
export function normalizeTaskBudget(value?:Partial<TaskBudget>):TaskBudget {
  const integer=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,Math.floor(v))):fallback;
  return {maxMinutes:integer(value?.maxMinutes,DEFAULT_TASK_BUDGET.maxMinutes,1,120),maxRounds:integer(value?.maxRounds,DEFAULT_TASK_BUDGET.maxRounds,1,200),maxReportedTokens:integer(value?.maxReportedTokens,DEFAULT_TASK_BUDGET.maxReportedTokens,1,20_000_000)};
}
export function taskBudgetReason(budget:TaskBudget,elapsedMs:number,rounds:number,reportedTokens:number,beforeRequest=false):string {
  if(elapsedMs>=budget.maxMinutes*60_000)return `达到本机本次任务 ${budget.maxMinutes} 分钟上限，已暂停并保留未验收草稿；可通过“继续调整”或“继续修改”开启新一轮任务预算`;
  if(reportedTokens>=budget.maxReportedTokens)return `模型已报告用量达到本机本次任务 ${budget.maxReportedTokens.toLocaleString('en-US')} Token 上限（软上限），已暂停并保留未验收草稿；这不是单个资产的价格或账单，实际费用以服务方为准。复杂场景可在“高级设置”中提高“已报告 Token 上限”，或通过“继续调整”或“继续修改”开启新一轮任务预算`;
  if(beforeRequest&&rounds>=budget.maxRounds)return `达到本机本次任务 ${budget.maxRounds} 轮上限，已暂停并保留未验收草稿；可通过“继续调整”或“继续修改”开启新一轮任务预算`;
  return '';
}
