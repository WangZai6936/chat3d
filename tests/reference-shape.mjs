import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});let count=0;
const test=(name,fn)=>{fn();console.log('PASS',name);count++};
try{
 const {profileOpeningMetrics,referenceObservationCoverage}=await server.ssrLoadModule('/src/domain/referenceShape.ts');
 const {validateBlueprints}=await server.ssrLoadModule('/src/domain/objectBlueprint.ts');
 const {createInitialDoc}=await server.ssrLoadModule('/src/store.ts');
 const {applyBatch}=await server.ssrLoadModule('/src/domain/commands.ts');
 const doc=applyBatch(createInitialDoc(),{operations:[{op:'createPrimitive',name:'通透板测试',parentId:null,materialId:'mat_gray',transform:{position:[0,0,0],rotationQuaternion:[0,0,0,1],scale:[1,1,1]},geometry:{type:'profile',params:{points:[[0,0],[1,0],[1,1],[0,1]],depth:.02,holes:[[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]]}}}]}).doc;
 test('known rectangular opening reports 64 percent nominal planar area',()=>{const m=profileOpeningMetrics(doc).items[0];assert.ok(Math.abs(m.openingAreaRatio-.64)<1e-9);assert.equal(m.holeCount,1);assert.equal(m.depth,.02)});
 test('reversing polygon winding does not change opening fraction',()=>{const d=structuredClone(doc);d.nodes[0].geometry.params.points.reverse();d.nodes[0].geometry.params.holes[0].reverse();assert.ok(Math.abs(profileOpeningMetrics(d).items[0].openingAreaRatio-.64)<1e-9)});
 test('closed plates explicitly report zero openings',()=>{const d=structuredClone(doc);d.nodes[0].geometry.params.holes=[];assert.equal(profileOpeningMetrics(d).items[0].openingAreaRatio,0)});
 test('hidden geometry is excluded and no fidelity claim is inferred',()=>{const d=structuredClone(doc);d.nodes[0].visible=false;assert.equal(profileOpeningMetrics(d).items.length,0);assert.match(profileOpeningMetrics(doc).limitation,/不等于/)});
 const plan={key:'form',name:'参考对象',purpose:'核对结构',detailLevel:'closeup',detailReason:'对照参考图',silhouette:'框架与开口',features:[{key:'form',name:'面板',role:'form',geometryApproach:'profile'}],negativeSpaces:['贯通开口'],views:['top','side']};
 test('reference observations missing from an existing plan remain unverified',()=>{const r=referenceObservationCoverage([plan],true);assert.equal(r.featureCount,1);assert.equal(r.recordedCount,0);assert.equal(r.issues.length,1);assert.equal(r.accepted,false)});
 test('recorded observation is counted without claiming image similarity',()=>{const p={...plan,features:[{...plan.features[0],referenceObservation:'可见细筋围成大面积开口；背面未知'}]};validateBlueprints([p]);const r=referenceObservationCoverage([p],true);assert.equal(r.recordedCount,1);assert.equal(r.accepted,false);assert.equal(r.issues.length,0)});
 test('unplanned references are flagged while text-only jobs stay unaffected',()=>{assert.equal(referenceObservationCoverage([],true).issues.length,1);assert.equal(referenceObservationCoverage([plan],false).issues.length,0)});
 test('invalid or unbounded reference observations are rejected',()=>{for(const x of ['', 'x'.repeat(361)])assert.throws(()=>validateBlueprints([{...plan,features:[{...plan.features[0],referenceObservation:x}]}]),/参考特征/)});
 console.log(count+' reference shape checks passed; deterministic fixtures, no image similarity or API benchmark');
}finally{await server.close()}
