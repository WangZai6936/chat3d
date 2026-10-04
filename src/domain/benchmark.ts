export interface BenchmarkResult {
 caseId:string;promptHash:string;initialSceneHash:string;model:string;settingsHash:string;renderer:string;parallel:boolean;version:string;
 elapsedMs:number;inputTokens:number;outputTokens:number;usageComplete:boolean;status:'completed'|'failed'|'interrupted';
 visualReview:'passed'|'failed'|'unverified';structuralIssues:number|null;
}
export function compareBenchmarks(baseline:BenchmarkResult,candidate:BenchmarkResult){
 const reasons:string[]=[];
 for(const key of ['caseId','promptHash','initialSceneHash','model','settingsHash','renderer','parallel'] as const)if(baseline[key]!==candidate[key])reasons.push(`不同的 ${key}`);
 for(const r of [baseline,candidate]){
  if(r.status!=='completed')reasons.push('存在未完成的运行');
  if(!r.usageComplete)reasons.push('存在不完整用量');
  if(!r.version||!r.caseId||!r.promptHash||!r.initialSceneHash||!r.settingsHash||!r.model||!r.renderer)reasons.push('缺少对照条件');
  if([r.elapsedMs,r.inputTokens,r.outputTokens].some(v=>!Number.isFinite(v)||v<0))reasons.push('指标无效');
 }
 for(const r of [baseline,candidate])if(r.structuralIssues!==null&&(!Number.isSafeInteger(r.structuralIssues)||r.structuralIssues<0))reasons.push('结构问题指标无效');
 if(reasons.length)return {comparable:false,reasons:[...new Set(reasons)],performance:null,quality:'unverified'};
 const total=(r:BenchmarkResult)=>r.inputTokens+r.outputTokens;
 return {comparable:true,reasons:[],performance:{elapsedDeltaMs:candidate.elapsedMs-baseline.elapsedMs,tokenDelta:total(candidate)-total(baseline),elapsedPercent:baseline.elapsedMs?(candidate.elapsedMs/baseline.elapsedMs-1)*100:null,tokenPercent:total(baseline)?(total(candidate)/total(baseline)-1)*100:null},quality:candidate.visualReview==='failed'||(baseline.structuralIssues!==null&&candidate.structuralIssues!==null&&candidate.structuralIssues>baseline.structuralIssues)?'regression_or_failure':baseline.visualReview==='passed'&&candidate.visualReview==='passed'&&baseline.structuralIssues!==null&&candidate.structuralIssues!==null?'both_reviewed':'unverified'};
}
