import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {analyzeRun} from './analyze-run.mjs';
const median=xs=>{const a=[...xs].sort((a,b)=>a-b),n=a.length;return n?(a[Math.floor((n-1)/2)]+a[Math.ceil((n-1)/2)])/2:null};
export function compareRuns(entries){
 if(!Array.isArray(entries)||!entries.length)throw Error('No benchmark records');
 const cases=new Map();for(const row of entries){if(!['baseline','candidate'].includes(row.variant)||typeof row.caseId!=='string')throw Error('Invalid case or variant');const group=cases.get(row.caseId)??[];group.push(row);cases.set(row.caseId,group);}
 return [...cases].map(([caseId,rows])=>{const base=rows.filter(r=>r.variant==='baseline'),candidate=rows.filter(r=>r.variant==='candidate');const reasons=[];
 if(base.length<5||base.length!==candidate.length)reasons.push('Need at least five equal-count baseline/candidate trials');
 if(rows.some((r,i)=>i&&r.variant===rows[i-1].variant))reasons.push('Trials were not interleaved');
 for(const key of ['fixtureHash','settingsHash'])if(rows.some(r=>typeof r[key]!=='string'||!/^[a-f0-9]{64}$/.test(r[key]))||new Set(rows.map(r=>r[key])).size!==1)reasons.push('Missing or different '+key);
 const analyses=rows.map(r=>analyzeRun(r.diagnostics));const models=rows.map(r=>r.diagnostics.run.executionMeta?.model);if(models.some(m=>!m)||new Set(models).size!==1)reasons.push('Missing or different model identity');
 if(analyses.some(a=>a.usageIncomplete||a.unfinishedTimings||a.wallSeconds===null))reasons.push('Incomplete timing or usage');
 if(rows.some(r=>r.accepted!==true))reasons.push('At least one trial did not pass its supplied acceptance result');
 const metrics=variant=>{const a=analyses.filter((_,i)=>rows[i].variant===variant);const times=a.map(x=>x.wallSeconds).filter(x=>x!==null),inputs=a.map(x=>x.reportedInputTokens).filter(x=>x!==null);return {count:a.length,medianSeconds:median(times),minSeconds:times.length?Math.min(...times):null,maxSeconds:times.length?Math.max(...times):null,medianInputTokens:median(inputs),failedTimings:a.reduce((n,x)=>n+x.failedTimings,0),unknownUsage:a.reduce((n,x)=>n+x.usageUnknown,0)};};
 const b=metrics('baseline'),c=metrics('candidate');if(c.failedTimings>b.failedTimings)reasons.push('Candidate has more failed timings');
 const reduction=(x,y)=>x>0&&y!==null?1-y/x:null,timeReduction=reduction(b.medianSeconds,c.medianSeconds),inputReduction=reduction(b.medianInputTokens,c.medianInputTokens);
 return {caseId,baseline:b,candidate:c,timeReduction,inputReduction,comparable:reasons.length===0,observedTargetsMet:reasons.length===0&&timeReduction>=.2&&inputReduction>=.3,reasons,limits:'Hashes and acceptance flags are supplied by the benchmark manifest. This report does not independently prove task equivalence, visual quality, or statistical significance.'};});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const manifest=process.argv[2];if(!manifest)throw Error('Usage: node scripts/compare-agent-runs.mjs manifest.json');const data=JSON.parse(fs.readFileSync(manifest,'utf8'));const records=data.records.map(r=>{const p=path.resolve(path.dirname(manifest),r.file);if(fs.statSync(p).size>50*1024*1024)throw Error('Diagnostic file exceeds 50 MiB');return {...r,diagnostics:JSON.parse(fs.readFileSync(p,'utf8'))};});console.log(JSON.stringify(compareRuns(records),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
