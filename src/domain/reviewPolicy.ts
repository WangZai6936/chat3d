import type {SceneDocument,SceneNode,Material} from './types';
const shape=(n:SceneNode)=>({id:n.id,parentId:n.parentId,kind:n.kind,geometry:n.geometry,assetId:n.assetId,transform:n.transform,visible:n.visible});
const appearance=(n:SceneNode,materials:Map<string,Material>)=>({shape:shape(n),label:n.label,material:materials.get(n.materialId??'')});
// Names, grouping and planning metadata are not pixels. Rendered labels ARE pixels.
export function visualFingerprint(doc:SceneDocument):string{
 const materials=new Map(doc.materials.map(m=>[m.id,m]));
 return JSON.stringify({nodes:doc.nodes.map(n=>appearance(n,materials)),assets:doc.assets,animation:doc.animation});
}
export type ReviewRequirement={kind:'none'|'local'|'whole'|'animation';assemblyId?:string};
export function reviewRequirement(base:SceneDocument,draft:SceneDocument):ReviewRequirement{
 if(JSON.stringify(base.animation)!==JSON.stringify(draft.animation)&&draft.animation)return {kind:'animation'};
 if(visualFingerprint(base)===visualFingerprint(draft))return {kind:'none'};
 const byId=new Map(base.nodes.map(n=>[n.id,n]));
 if(base.nodes.length!==draft.nodes.length||JSON.stringify(base.assets)!==JSON.stringify(draft.assets)||JSON.stringify(base.animation)!==JSON.stringify(draft.animation))return {kind:'whole'};
 const oldMaterials=new Map(base.materials.map(m=>[m.id,m])),newMaterials=new Map(draft.materials.map(m=>[m.id,m]));
 const changed:SceneNode[]=[];
 for(const n of draft.nodes){const old=byId.get(n.id);if(!old||JSON.stringify(shape(old))!==JSON.stringify(shape(n)))return {kind:'whole'};if(JSON.stringify(appearance(old,oldMaterials))!==JSON.stringify(appearance(n,newMaterials)))changed.push(n);}
 const groups=new Set(changed.map(n=>n.assemblyId));
 return groups.size===1&&changed[0]?.assemblyId?{kind:'local',assemblyId:changed[0].assemblyId}:{kind:'whole'};
}
