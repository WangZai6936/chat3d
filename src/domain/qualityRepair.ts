import type {DetailAcceptance,DetailReview,DetailCriterion} from './detailAcceptance';
export interface RepairItem {componentId:string;criterion:DetailCriterion|'review';action:'repair'|'inspect'|'blocked'|'deferred';reason:string;next:string;nodeIds:string[];failedVersions:number}
export class RepairAttempts {
 private entries=new Map<string,{versions:Set<number>;resolved:boolean}>();
 record(reviews:DetailReview[],componentVersions:Map<string,number>){for(const r of reviews)for(const c of r.checks){const key=r.componentId+':'+c.criterion;if(c.status==='pass'||c.status==='not_applicable'){this.entries.delete(key);continue;}if(c.status!=='fail')continue;const old=this.entries.get(key)??{versions:new Set<number>(),resolved:false};old.versions.add(componentVersions.get(r.componentId)??0);this.entries.set(key,old);}}
 failures(componentId:string,criterion:string){return this.entries.get(componentId+':'+criterion)?.versions.size??0;}
}
const repairAdvice:Record<DetailCriterion,string>={silhouette:'对照用途及参考修正该组件轮廓与比例，优先连续截面或网格，保留其他组件',structure:'定位缺少的功能结构或真实开口，仅补改对应零件',connections:'核对真实接触面、目标点和作业姿态，局部调整连接部件；人员使用手臂/手部联动工具',materials:'只调整被指出的表面或材质，不对整个场景统一刷色',details:'根据对象用途补齐有证据的必要细节，不以零件数量替代形体',context:'核对相邻对象、通路与操作净空，保留不受影响的布局'};
export function buildQualityRepairQueue(report:DetailAcceptance,capabilities:{visual:boolean;geometryOnly:boolean},attempts=new RepairAttempts()){
 const items:RepairItem[]=[];
 for(const target of report.targets){const r=report.reviews.find(r=>r.componentId===target.id&&r.revision===report.revision);if(!r){items.push({componentId:target.id,criterion:'review',action:capabilities.visual?'inspect':'blocked',reason:'当前版本尚无完整细节检查',next:capabilities.visual?'先隔离该单体取得至少两个近景视角，再回到全景核对关系':'保留未验收状态，等待可用渲染，不重复请求不可用截图',nodeIds:[],failedVersions:0});continue;}
 for(const c of r.checks){if(c.status==='pass'||c.status==='not_applicable')continue;const failedVersions=attempts.failures(target.id,c.criterion);let action:RepairItem['action']=c.status==='fail'?'repair':'inspect';let next=c.status==='fail'?repairAdvice[c.criterion]:'取得当前目标清晰近景，再记录证据；没有新画面不重复填写同一未知结论';
 if(c.status==='unknown'&&(!capabilities.visual||(capabilities.geometryOnly&&c.criterion==='materials'))){action='blocked';next='当前渲染不能支持该结论，保留待验收；继续可修复的问题，不重复取相同软件图';}
 else if(c.status==='unknown'&&/遮挡|看不清|occlud/i.test(c.evidence))next='先用隔离组件诊断图看清结构，再用全景检查遮挡和空间关系；不可凭隔离图判断场景关系';
 if(c.status==='fail'&&failedVersions>=3){action='deferred';next='初次失败后两个修改版本仍未通过，暂停此项重试并交付具体缺陷，不降低验收标准';}
 items.push({componentId:target.id,criterion:c.criterion,action,reason:c.evidence,next,nodeIds:c.nodeIds,failedVersions});}}
 const priority={repair:0,inspect:1,blocked:2,deferred:3};items.sort((a,b)=>priority[a.action]-priority[b.action]);const counts={repair:0,inspect:0,blocked:0,deferred:0};for(const item of items)counts[item.action]++;
 return {revision:report.revision,items:items.slice(0,24),total:items.length,remaining:Math.max(0,items.length-24),counts,accepted:false as const,instruction:'先处理明确缺陷，再补证据；一次只改相关组件，改后局部复核。受阻或暂停项继续保持未验收，不得当作通过。'};
}
