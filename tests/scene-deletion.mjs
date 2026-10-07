import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let count=0;
const test=async(name,fn)=>{await fn();console.log('PASS '+name);count++;};
try{
 const {applyBatch,deletionNodeIds}=await server.ssrLoadModule('/src/domain/commands.ts');
 const {createInitialDoc,createEditorStore,useEditorStore:ui}=await server.ssrLoadModule('/src/store.ts');
 const {bindConversationStore}=await server.ssrLoadModule('/src/conversationStores.ts');
 const {validateDocument}=await server.ssrLoadModule('/src/domain/types.ts');
 const {checkEditScope}=await server.ssrLoadModule('/src/domain/editScope.ts');
 const {conversationScope}=await server.ssrLoadModule('/src/domain/conversationScope.ts');
 const {quickEdit}=await server.ssrLoadModule('/src/domain/quickEdit.ts');
 const {parseModelResponse,buildSceneContext,buildSystemPrompt}=await server.ssrLoadModule('/src/ai/provider.ts');
 const {runModelingAgent}=await server.ssrLoadModule('/src/ai/modelingAgent.ts');
 const node=(id,extra={})=>({id,parentId:null,name:id,kind:'primitive',materialId:'mat_gray',visible:true,geometry:{type:'box',params:{width:1,height:1,depth:1}},transform:{position:[0,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]},...extra});
 const doc=(nodes)=>({...createInitialDoc(),nodes});
 const connection=targetId=>({targetId,sourcePoint:[0,0,0],targetPoint:[0,0,0],maxDistance:.1,purpose:'接触'});
 const track=(id,targetIds,extra={})=>({id,name:id,targetIds,channel:'position',keyframes:[{time:0,value:[0,0,0]},{time:2,value:[1,0,0]}],...extra});
 const animated=()=>({...doc([node('a',{assemblyId:'a',assemblyName:'机组'}),node('b',{assemblyId:'a',assemblyName:'机组'}),node('child',{parentId:'b'}),node('external',{connection:connection('b')}),node('follower'),node('other')]),animation:{version:1,name:'motion',duration:2,loop:true,tracks:[track('shared',['a','b','other']),track('child-motion',['child']),{id:'follow',name:'follow',channel:'follow',targetIds:['follower'],sourceId:'b',start:0,end:2},track('other-motion',['external'])]}});
 await test('single part deletion is genuine and does not expand to sibling assembly members',()=>{
  const before=animated(),result=applyBatch(before,{operations:[{op:'delete',targetId:'a'}]});assert.equal(result.errors.length,0);assert.ok(!result.doc.nodes.some(n=>n.id==='a'));assert.ok(result.doc.nodes.some(n=>n.id==='b'));assert.equal(before.nodes.length,6);assert.equal(result.doc.materials,before.materials);
 });
 await test('whole assembly deletion cascades children and repairs connection / animation references',()=>{
  const before=animated(),snapshot=structuredClone(before),result=applyBatch(before,{operations:[{op:'delete',targetId:'b',scope:'assembly'}]});assert.equal(result.errors.length,0);assert.deepEqual(result.doc.nodes.map(n=>n.id),['external','follower','other']);assert.equal(result.doc.nodes[0].connection,undefined);assert.deepEqual(result.doc.animation.tracks.map(t=>[t.id,t.targetIds]),[['shared',['other']],['other-motion',['external']]]);assert.deepEqual(before,snapshot);assert.equal(validateDocument(result.doc).length,0);assert.deepEqual(new Set(deletionNodeIds(before,{op:'delete',targetIds:['b','a','child']})),new Set(['a','b','child']));
 });
 await test('delete / undo / redo restores exact node order, hierarchy, relationships, metadata and motion',()=>{
  const before=animated(),store=createEditorStore({doc:before,selection:['a','b','other']});assert.equal(store.getState().deleteSelection().ok,true);const deleted=structuredClone(store.getState().doc);assert.deepEqual(store.getState().selection,[]);assert.equal(store.getState().past.length,1);store.getState().undo();assert.deepEqual({...store.getState().doc,revision:before.revision},before);store.getState().select(['a','external']);store.getState().redo();assert.deepEqual({...store.getState().doc,revision:deleted.revision},deleted);assert.deepEqual(store.getState().selection,['external']);
 });
 await test('large partial multiselect is one transaction, deduplicates roots and removes descendants once',()=>{
  const before=doc(Array.from({length:400},(_,i)=>node('p'+i,{assemblyId:'p0'}))),store=createEditorStore({doc:before,selection:before.nodes.slice(0,300).map(n=>n.id)});assert.equal(store.getState().deleteSelection().ok,true);assert.equal(store.getState().doc.nodes.length,100);assert.equal(store.getState().past.length,1);store.getState().undo();assert.deepEqual(store.getState().doc.nodes,before.nodes);const nested=doc([node('parent'),node('child',{parentId:'parent'}),node('grandchild',{parentId:'child'})]);const r=applyBatch(nested,{operations:[{op:'delete',targetIds:['parent','child','parent']}]});assert.equal(r.errors.length,0);assert.equal(r.doc.nodes.length,0);
 });
 await test('deleting all animation targets removes empty program and undo fully restores it',()=>{
  const before=animated(),store=createEditorStore({doc:before,selection:before.nodes.map(n=>n.id)});store.getState().deleteSelection();assert.equal(store.getState().doc.nodes.length,0);assert.equal(store.getState().doc.animation,undefined);store.getState().undo();assert.deepEqual(store.getState().doc.animation,before.animation);
 });
 await test('invalid IDs or target shape fail the entire batch without partial deletion',()=>{
  const before=animated();for(const bad of [{op:'delete',targetIds:[]},{op:'delete',targetId:'a',targetIds:['b']},{op:'delete',targetIds:['a','missing']},{op:'delete',targetId:'a',scope:'all'},{op:'delete',targetIds:'a'}]){const result=applyBatch(before,{operations:[{op:'rename',targetId:'a',name:'changed'},bad]});assert.ok(result.errors.length);assert.equal(result.doc,before);assert.equal(result.applied.length,0);}
 });
 await test('create then delete temp IDs undo cleanly without leaving phantom nodes',()=>{
  const before=doc([node('existing')]),store=createEditorStore({doc:before});assert.equal(store.getState().applyCommandBatch([{op:'createPrimitive',tempId:'new',name:'new',parentId:null,geometry:node('x').geometry,transform:node('x').transform},{op:'delete',targetIds:['new','existing']}],'create-delete').ok,true);assert.equal(store.getState().doc.nodes.length,0);store.getState().undo();assert.deepEqual(store.getState().doc.nodes,before.nodes);
 });
 await test('asset source descriptors and materials survive scene deletion and restoration unchanged',()=>{
  const before=doc([node('asset-instance',{modelAsset:{id:'library-record',version:2,instanceId:'instance-a',sourceNodeId:'original-part'}})]);before.assets=[{id:'original-asset',name:'asset',kind:'mesh',uri:'asset.glb'}];const result=applyBatch(before,{operations:[{op:'delete',targetId:'asset-instance'}]});assert.equal(result.errors.length,0);assert.equal(result.doc.assets,before.assets);assert.equal(result.doc.materials,before.materials);
 });
 await test('partial deletion preserves the surviving assembly blueprint and undo restores its original host',()=>{
  const blueprint={key:'body',name:'component',purpose:'test',detailLevel:'scene',detailReason:'test',silhouette:'box',features:[{key:'shape',name:'body',role:'form',geometryApproach:'primitive'}],negativeSpaces:[],views:['front','back']};const before=doc([node('a',{assemblyId:'a',modelStructure:{blueprintKey:'body',featureKeys:['shape'],blueprint}}),node('b',{assemblyId:'a',modelStructure:{blueprintKey:'body',featureKeys:[]}}),node('c')]),store=createEditorStore({doc:before,selection:['a']});assert.equal(store.getState().deleteSelection().ok,true);assert.deepEqual(store.getState().doc.nodes[0].modelStructure.blueprint,blueprint);store.getState().undo();assert.deepEqual(store.getState().doc.nodes,before.nodes);store.getState().redo();assert.equal(store.getState().doc.nodes[0].id,'b');
 });
 await test('scope allows deleting a shared-track target without changing motion for unselected targets',()=>{
  const before=animated(),after=applyBatch(before,{operations:[{op:'delete',targetId:'a'}]}).doc;assert.deepEqual(checkEditScope(before,after,{nodeIds:['a']}),[]);assert.ok(checkEditScope(before,after,{lockPlacement:true}).length);const cascaded=applyBatch(before,{operations:[{op:'delete',targetId:'b'}]}).doc;assert.ok(checkEditScope(before,cascaded,{nodeIds:['b','child']}).length,'external connection/follow dependencies remain protected');assert.deepEqual(conversationScope('只删除选中的零件',before,['b']).nodeIds,['b']);
 });
 await test('all preview/generation phases block deletion and leave selection / history intact',()=>{
  for(const aiStatus of ['capturing','context','generating','validating','previewing','applying']){const before=animated(),store=createEditorStore({doc:before,selection:['a'],aiStatus});assert.equal(store.getState().deleteSelection().ok,false);assert.equal(store.getState().doc,before);assert.equal(store.getState().past.length,0);assert.deepEqual(store.getState().selection,['a']);}
 });
 await test('provider accepts deletion schema and rejects ambiguous / invalid deletion arguments',()=>{
  for(const op of [{op:'delete',targetId:'a'},{op:'delete',targetId:'b',scope:'assembly'},{op:'delete',targetIds:['a','b']}])assert.deepEqual(parseModelResponse(JSON.stringify({summary:'delete',operations:[op]})).operations,[op]);for(const op of [{op:'delete'},{op:'delete',targetIds:[]},{op:'delete',targetIds:['a',1]},{op:'delete',targetId:'a',targetIds:['b']},{op:'delete',targetId:'a',scope:'scene'}])assert.throws(()=>parseModelResponse(JSON.stringify({summary:'bad',operations:[op]})));const prompt=buildSystemPrompt(buildSceneContext(animated(),[]));assert.match(prompt,/真正删除/);assert.doesNotMatch(prompt,/复制、删除、分组/);
 });
 await test('explicit local conversational deletion works for whole assemblies, multiselect and animation cleanup',()=>{
  const before=animated();const assembly=quickEdit('删除机组',before,[]);assert.ok(assembly);assert.deepEqual(assembly.result.doc.nodes.map(n=>n.id),['external','follower','other']);const selected=quickEdit('删除选中的对象',before,['a','other']);assert.ok(selected);assert.ok(!selected.result.doc.nodes.some(n=>['a','other'].includes(n.id)));for(const text of ['不要删除机组','删除机组吗？','如果删除机组','删除机组然后改色'])assert.equal(quickEdit(text,before,[]),null);assert.equal(quickEdit('删除选中的对象',before,[]),null);
 });
 await test('projected UI deletion and undo remain local when another conversation is running',()=>{
  const a=createEditorStore({doc:animated(),selection:['a']}),b=createEditorStore({doc:doc([node('other-project')]),aiStatus:'generating',selection:['other-project']});bindConversationStore(a);assert.equal(ui.getState().deleteSelection().ok,true);assert.equal(a.getState().doc.nodes.length,5);const aDeleted=a.getState().doc;bindConversationStore(b);assert.equal(ui.getState().deleteSelection().ok,false);assert.equal(b.getState().doc.nodes.length,1);assert.equal(a.getState().doc,aDeleted);bindConversationStore(a);ui.getState().undo();assert.equal(a.getState().doc.nodes.length,6);assert.equal(b.getState().aiStatus,'generating');
 });
 const config={baseURL:'https://mock.invalid/v1',apiKey:'mock-only',model:'mock',useMock:false};
 const scripted=steps=>{let index=0;const contexts=[];return {contexts,fn:async(model,context)=>{contexts.push(structuredClone(context));const step=steps[index++]??'done',message={role:'assistant',content:Array.isArray(step)?step.map((a,i)=>({type:'toolCall',id:`call_${index}_${i}`,name:a.name,arguments:a.args})):[{type:'text',text:step}],api:'openai-completions',provider:'mock',model:'mock',stopReason:Array.isArray(step)?'toolUse':'stop',timestamp:Date.now(),usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};const stream=createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:'start',partial:message});stream.push({type:'done',reason:message.stopReason,message});});return stream;}};};
 await test('mocked AI edit_scene genuinely deletes, previews only, then confirm / undo restore correctly',async()=>{
  const before=animated(),transport=scripted([[{name:'edit_scene',args:{summary:'删除机组',operations:[{op:'delete',targetId:'b',scope:'assembly'}]}}],'已保留删除草稿']);const result=await runModelingAgent({text:'请把指定机组从画面中移除，其他对象保留',document:before,selection:[],config,streamFn:transport.fn,captureAvailable:()=>false});assert.equal(before.nodes.length,6);assert.equal(result.result.doc.nodes.length,3);assert.equal(result.batch.operations[0].op,'delete');const store=createEditorStore({doc:before,selection:['a','other'],aiStatus:'previewing',pendingBatch:result.batch,pendingResult:result.result,previewDoc:result.result.doc});store.getState().confirmPending();assert.deepEqual(store.getState().selection,['other']);assert.equal(store.getState().past.length,1);store.getState().undo();assert.deepEqual(store.getState().doc.nodes,before.nodes);assert.deepEqual(store.getState().doc.animation,before.animation);
 });
 await test('mocked AI deletion outside explicit scope fails without changing the draft',async()=>{
  const before=animated(),transport=scripted([[{name:'edit_scene',args:{summary:'invalid',operations:[{op:'delete',targetId:'other'}]}}],'范围外未删除']);const result=await runModelingAgent({text:'只处理指定零件',document:before,selection:['a'],editScope:{nodeIds:['a']},config,streamFn:transport.fn,captureAvailable:()=>false});assert.deepEqual(result.result.doc.nodes,before.nodes);assert.ok(transport.contexts.flatMap(c=>c.messages).some(m=>m.role==='toolResult'&&m.isError&&JSON.stringify(m).includes('超出修改范围')));
 });
 console.log(count+' scene deletion checks passed (mocked AI only, no paid calls)');
}finally{await server.close()}
