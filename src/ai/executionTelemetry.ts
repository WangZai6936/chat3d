import packageInfo from '../../package.json';
export type UsageState='reported'|'reported-zero'|'unknown';
export function normalizedUsage(value:unknown,providerReported=false){
 const u=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;
 const uncachedInputTokens=count(u.input),cacheReadTokens=count(u.cacheRead),cacheWriteTokens=count(u.cacheWrite),outputTokens=count(u.output);
 const inputTokens=uncachedInputTokens+cacheReadTokens+cacheWriteTokens;
 const usageState:UsageState=inputTokens+outputTokens>0?'reported':providerReported?'reported-zero':'unknown';
 return {inputTokens,uncachedInputTokens,cacheReadTokens,cacheWriteTokens,outputTokens,usageState};
}
export function providerHasUsage(data:unknown){
 if(!data||typeof data!=='object')return false;const d=data as Record<string,any>;const u=d.usage??d.response?.usage;
 return !!u&&typeof u==='object'&&[['prompt_tokens','completion_tokens'],['input_tokens','output_tokens']].some(keys=>keys.every(k=>typeof u[k]==='number'&&Number.isFinite(u[k])&&u[k]>=0));
}
export function executionMetadata(model:string,secret:string,revision:number){
 const safeModel=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model)&&!/^sk-|bearer|token-/i.test(model)&&(!secret||!model.includes(secret))?model:undefined;
 return {appVersion:packageInfo.version,model:safeModel,initialRevision:revision,buildCommit:typeof __APP_BUILD_COMMIT__==='string'&&/^[a-f0-9]{40}$/.test(__APP_BUILD_COMMIT__)?__APP_BUILD_COMMIT__:'local',contextPolicy:'edit-delta-v1',executionMode:'pi' as const};
}
