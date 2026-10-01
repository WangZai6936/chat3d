import { WORKSHOP_MATERIALS } from '../workshop/materials';
import { Material, SceneDocument } from './types';
export const EXTRA_MATERIALS: Material[] = [...WORKSHOP_MATERIALS,
  {id:'mat_floor',baseColor:'#73858A',roughness:.78,metalness:0},
  {id:'mat_wall',baseColor:'#D2D9D8',roughness:.92,metalness:0},
  {id:'mat_paint',baseColor:'#D7E0E3',roughness:.32,metalness:.18},
  {id:'mat_brushed',baseColor:'#9AAAB5',roughness:.24,metalness:.88},
  {id:'mat_fabric',baseColor:'#365D72',roughness:1,metalness:0},
  {id:'mat_skin',baseColor:'#BF9273',roughness:.9,metalness:0},
  {id:'mat_light',baseColor:'#E3EEE8',roughness:.3,metalness:0,emissive:'#D9F0ED',emissiveIntensity:.6},
  {id:'mat_glass',baseColor:'#263E46',roughness:0.14,metalness:0.12,opacity:0.38},
  {id:'mat_screen',baseColor:'#123C52',roughness:0.28,metalness:0.08},
  {id:'mat_pcb',baseColor:'#205743',roughness:0.65,metalness:0.05},
  {id:'mat_green',baseColor:'#42BA8A',roughness:0.28,metalness:0.08},
  {id:'mat_red',baseColor:'#B9232C',roughness:0.42,metalness:0.08},
  {id:'mat_cyan',baseColor:'#A0F2EF',roughness:0.3,metalness:0.05},
  {id:'mat_black',baseColor:'#111315',roughness:0.46,metalness:0.25},
];
// Add missing stock colors without overwriting any existing project's custom materials.
export function withStockMaterials(doc: SceneDocument): SceneDocument {
  return {...doc,materials:[...doc.materials,...EXTRA_MATERIALS.filter(m=>!doc.materials.some(existing=>existing.id===m.id)).map(m=>({...m}))]};
}
