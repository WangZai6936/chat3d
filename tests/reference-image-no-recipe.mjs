import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
  const {buildModelingPrompt}=await server.ssrLoadModule('/src/ai/agentPrompt.ts');
  const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');
  const {normalizeTaskBudget,taskBudgetReason,TASK_BUDGET_PRESETS}=await server.ssrLoadModule('/src/ai/taskBudget.ts');
  assert.equal(TASK_BUDGET_PRESETS.standard.maxReportedTokens,2_000_000);
  assert.equal(normalizeTaskBudget().maxReportedTokens,2_000_000);
  const reason=taskBudgetReason(normalizeTaskBudget(),0,0,2_000_000);
  assert.match(reason,/软上限/);
  assert.match(reason,/不是单个资产的价格或账单/);
  assert.match(reason,/实际费用以服务方为准/);
  const doc=createInitialDoc();
  const base={draft:doc,base:doc,selection:[],generationQuality:'fine',wantsAnimation:false,visualAvailable:true,parallelEnabled:false,preserveAssetShape:false};
  const withRef=buildModelingPrompt({...base,hasReferenceImages:true});
  assert.match(withRef,/禁止用read_component_recipe或add_reference_component/);
  assert.match(withRef,/用户已提供参考图/);
  const noRef=buildModelingPrompt({...base,hasReferenceImages:false});
  assert.doesNotMatch(noRef,/禁止用read_component_recipe或add_reference_component/);
  console.log('PASS reference-image-no-recipe + 2M soft budget');
}finally{await server.close();}
