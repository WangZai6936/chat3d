import {anchorSurfaceDistance} from './contactQuality';
import {inspectGeometryQuality} from './geometryQuality';
import {assetDocument,type ModelAssetVersion} from './modelAssets';
export function inspectAssetPreflight(asset:ModelAssetVersion){
 const budget={remaining:200000};
 const anchors=(asset.contract?.anchors??[]).map(a=>{const n=asset.nodes.find(n=>n.id===a.nodeId)!;const requiresSurface=['grip','mount','support'].includes(a.kind);const distance=requiresSurface?anchorSurfaceDistance(n,a.point,budget):null;return {id:a.id,name:a.name,requiresSurface,distance,status:!requiresSurface?'reference_only':distance===null?'unknown':distance>.02?'off_surface':'on_surface'};});
 return {anchors,geometryWarnings:inspectGeometryQuality(assetDocument(asset)),qualityAccepted:false as const,note:'连接点到三角面的距离只检查点位，不证明无穿插、合理握持或整体模型质量。操作位和进出料口可能位于空间或开口，只作参考点。'};
}
