import {assemblyBounds} from './assemblyEditing';
import {inspectAssetPreflight} from './assetPreflight';
import {Box3,Matrix4,Vector3,Quaternion} from 'three';
import {nodeMatrix,worldAnchor,anchorCompatibility} from './assetContract';
import type {SceneDocument,Vec3} from './types';
import type {ModelAssetVersion} from './modelAssets';
import type {Command} from './commands';
export function inspectAssetInstance(doc:SceneDocument,asset:ModelAssetVersion,instanceId:string){
 const nodes=doc.nodes.filter(n=>n.modelAsset?.instanceId===instanceId),bySource=new Map(nodes.map(n=>[n.modelAsset?.sourceNodeId,n])),issues:string[]=[];
 if(!nodes.length)throw Error('场景实例不存在');
 if(nodes.some(n=>n.modelAsset?.id!==asset.id||n.modelAsset?.version!==asset.version))issues.push('实例来源版本不一致');
 if(nodes.length!==asset.nodes.length||bySource.size!==nodes.length||asset.nodes.some(n=>!bySource.has(n.id)))issues.push('实例零件增删或旧版本缺少来源映射');
 const first=asset.nodes.find(n=>bySource.has(n.id));const frame=first?nodeMatrix(bySource.get(first.id)!).multiply(nodeMatrix(first).invert()):new Matrix4();
 const p=new Vector3(),q=new Quaternion(),scale=new Vector3();frame.decompose(p,q,scale);if(scale.toArray().some(n=>Math.abs(n-1)>1e-5))issues.push('实例发生缩放，需重验结构与连接');
 for(const n of asset.nodes){const actual=bySource.get(n.id);if(!actual)continue;const expected=nodeMatrix(n).premultiply(frame);if(expected.elements.some((v,i)=>Math.abs(v-nodeMatrix(actual).elements[i])>1e-5)||JSON.stringify(n.geometry)!==JSON.stringify(actual.geometry)||n.visible!==actual.visible)issues.push('零件形体或相对姿态已变化：'+n.name);
 if(JSON.stringify(n.modelStructure)!==JSON.stringify(actual.modelStructure))issues.push('结构方案或特征关联已变化：'+n.name);
 const oldContact=n.connection?JSON.stringify(n.connection):'';const mapped=actual.connection?{...actual.connection,targetId:doc.nodes.find(x=>x.id===actual.connection!.targetId)?.modelAsset?.sourceNodeId??actual.connection.targetId}:undefined;if(oldContact!==(mapped?JSON.stringify(mapped):''))issues.push('连接关系已变化：'+n.name);
 const sm=asset.materials.find(m=>m.id===n.materialId),dm=doc.materials.find(m=>m.id===actual.materialId);const clean=(m:typeof sm)=>m?JSON.stringify({...m,id:undefined}):'';if(clean(sm)!==clean(dm))issues.push('材质已变化：'+n.name);}
 const clearanceCandidates:{id:string;name:string}[]=[];let clearanceStatus:'not_declared'|'checked'|'unknown'='not_declared';
 if(asset.contract?.clearance){const c=asset.contract.clearance,box=new Box3(new Vector3(...c.min),new Vector3(...c.max)).applyMatrix4(frame);const others=doc.nodes.filter(n=>n.visible&&n.modelAsset?.instanceId!==instanceId);if(!issues.length&&others.length<=2000){clearanceStatus='checked';const groups=new Map<string,typeof others>();for(const n of others){const key=n.assemblyId??n.id;groups.set(key,[...(groups.get(key)??[]),n]);}for(const [id,members] of groups){const overlap=box.clone().intersect(assemblyBounds(members)).getSize(new Vector3());if(overlap.toArray().every(v=>v>1e-5))clearanceCandidates.push({id,name:members[0].assemblyName??members[0].name});}}else clearanceStatus='unknown';}
 return {clearanceStatus,clearanceCandidates,clearanceNote:'保守包围盒候选，不代表精确碰撞或安全规范通过',instanceId,assetId:asset.id,version:asset.version,intrinsicUnchanged:issues.length===0,issues:[...new Set(issues)],anchors:(asset.contract?.anchors??[]).flatMap(a=>{const n=bySource.get(a.nodeId);return n?[{...a,nodeId:n.id,...worldAnchor(a,n)}]:[]}),frame,nodes};
}
export function alignAssetInstances(doc:SceneDocument,source:ModelAssetVersion,sourceInstance:string,sourceAnchorId:string,target:ModelAssetVersion,targetInstance:string,targetAnchorId:string,tolerance=.03):{operations:Command[];distanceBefore:number;needsReview:true}{
 if(sourceInstance===targetInstance)throw Error('不能把实例连接到自身');
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>.5)throw Error('连接容差无效');
 const s=inspectAssetInstance(doc,source,sourceInstance),t=inspectAssetInstance(doc,target,targetInstance);
 if(!s.intrinsicUnchanged||!t.intrinsicUnchanged)throw Error('实例已被编辑，连接点需重新确认后才能自动对齐');
 const sourcePoint=inspectAssetPreflight(source).anchors.find(x=>x.id===sourceAnchorId),targetPoint=inspectAssetPreflight(target).anchors.find(x=>x.id===targetAnchorId);if([sourcePoint,targetPoint].some(x=>x?.requiresSurface&&x.status!=='on_surface'))throw Error('抓握或安装支撑点未贴近真实表面，不能自动对齐');
 const a=s.anchors.find(x=>x.id===sourceAnchorId),b=t.anchors.find(x=>x.id===targetAnchorId);if(!a||!b)throw Error('连接点不存在');if(!anchorCompatibility(a.kind,b.kind))throw Error('连接点用途不兼容');
 const an=new Vector3(...a.normal),bn=new Vector3(...b.normal);if(an.dot(bn)>-.95)throw Error('连接点朝向不相对，请先调整实例朝向');
 const delta=new Vector3(...b.point).sub(new Vector3(...a.point));const operations:Command[]=s.nodes.map(n=>({op:'setTransform',targetId:n.id,transform:{position:new Vector3(...n.transform.position).add(delta).toArray() as Vec3}}));
 return {operations,distanceBefore:delta.length(),needsReview:true};
}
