import {inspectAssetPreflight} from './assetPreflight';
import {DETAIL_CRITERIA,type DetailCriterion} from './detailAcceptance';
import {geometryPayload} from './assetContract';
import type {ModelAssetVersion} from './modelAssets';
export const ASSET_VIEWS=['perspective','front','back','left','right','top'] as const;
export interface AssetEvidence {view:typeof ASSET_VIEWS[number];image:string;renderer:'software'|'webgl'|'server'}
export interface AssetQualityRecord {assetId:string;version:number;fingerprint:string;createdAt:string;reviewer:'user';origin?:'imported';checks:{criterion:DetailCriterion;status:'pass'|'fail'|'unknown'|'not_applicable';evidence:string}[];views:AssetEvidence[]}
export async function assetFingerprint(a:ModelAssetVersion):Promise<string>{const data=new TextEncoder().encode(geometryPayload(a.nodes,a.materials)+JSON.stringify(a.contract??null));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function validateAssetQuality(a:ModelAssetVersion,r:AssetQualityRecord):Promise<void>{
 if(!r||r.assetId!==a.id||r.version!==a.version||r.fingerprint!==await assetFingerprint(a)||r.reviewer!=='user'||(r.origin!==undefined&&r.origin!=='imported')||!Number.isFinite(Date.parse(r.createdAt)))throw Error('验收对象或几何已变化，请重新检查当前版本');
 if(!Array.isArray(r.checks)||r.checks.length!==6||new Set(r.checks.map(c=>c.criterion)).size!==6||r.checks.some(c=>!DETAIL_CRITERIA.some(k=>k.key===c.criterion)||!['pass','fail','unknown','not_applicable'].includes(c.status)||typeof c.evidence!=='string'||!c.evidence.trim()||c.evidence.length>600))throw Error('六项验收均需记录结论和依据');
 if(!Array.isArray(r.views)||r.views.length>6||new Set(r.views.map(v=>v.view)).size!==r.views.length||r.views.some(v=>!ASSET_VIEWS.includes(v.view)||!['software','webgl','server'].includes(v.renderer)||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v.image)||v.image.length>3*1024*1024))throw Error('验收图片格式、数量或大小无效');
 if(r.checks.some(c=>c.status==='pass')&&r.views.length<2)throw Error('通过结论至少需要两个不同视角的图片证据');
 if(r.checks.some(c=>c.criterion==='materials'&&c.status==='pass')&&!r.views.some(v=>v.renderer==='webgl'||v.renderer==='server'))throw Error('软件图不能通过材质验收');
 const contact=r.checks.find(c=>c.criterion==='connections');if(contact&&['pass','not_applicable'].includes(contact.status)&&inspectAssetPreflight(a).anchors.some(x=>x.requiresSurface&&x.status!=='on_surface'))throw Error('存在未贴近真实表面或未核对的连接点，不能通过连接验收');
 if(r.checks.some(c=>['silhouette','structure','materials','details'].includes(c.criterion)&&c.status==='not_applicable'))throw Error('轮廓、结构、材质和用途细节不能跳过');
}
export function assetQualityStatus(r?:AssetQualityRecord):'unreviewed'|'needs_work'|'pending'|'user_reviewed'{if(!r)return 'unreviewed';if(r.origin==='imported')return 'pending';if(r.checks.some(c=>c.status==='fail'))return 'needs_work';if(r.checks.some(c=>c.status==='unknown')||r.views.length<2)return 'pending';return 'user_reviewed';}
