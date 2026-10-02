import type {AgentActivity} from '../ai/modelingAgent';
// Only allowlisted operational metadata. Never export messages, raw errors, URLs,
// tool arguments, scene content, images or credentials (even if an error echoed them).
export function runDiagnostics(status:string,activity:AgentActivity|null,error:string|null){
 const category=!error?null:/体验页访问验证|访问会话/.test(error)?'site-access':/网络|连接|fetch|Connection/i.test(error)?'connection':/超时|无响应/.test(error)?'timeout':/校验|参数|工具/.test(error)?'validation':'unclassified';
 return {format:'chat3d-diagnostics-v1',createdAt:new Date().toISOString(),status,errorCategory:category,httpStatus:error?.match(/HTTP\s+(\d{3})/i)?.[1]??null,run:activity?{turns:activity.turn,toolCalls:activity.toolCalls,inputTokens:activity.inputTokens,outputTokens:activity.outputTokens,timings:activity.timings.map(t=>({kind:t.kind,startedAt:t.startedAt,endedAt:t.endedAt,failed:t.failed??false}))}:null};
}
