import {validateAnimation,type AnimationProgram} from './animation';
// Scene DSL — 可编辑场景文档是唯一可信来源（方案第 4 节）
// 右手坐标系、Y 轴向上；内部长度统一为米；宽度沿 X、高度沿 Y、深度沿 Z
import { isValidId } from '../util/ids';

export const SCHEMA_VERSION = 1;

export type Unit = 'm' | 'cm' | 'mm';
export type UpAxis = 'Y'; // 固定 Y-up，暂无其他选项

// 四元数顺序固定为 x、y、z、w 并验证归一化
export type Quaternion = [number, number, number, number];
export type Vec3 = [number, number, number];

export interface Transform {
  position: Vec3;
  rotationQuaternion: Quaternion;
  scale: Vec3;
}

// 类型白名单（方案 MVP：box、sphere、cylinder、cone、plane）
export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'roundedPlate' | 'capsule' | 'frame' | 'tube' | 'trapezoid';

export interface BoxParams {
  bevelRadius?: number;
  width: number;
  height: number;
  depth: number;
}
export interface SphereParams {
  radius: number;
  widthSegments: number;
  heightSegments: number;
}
export interface CylinderParams {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  radialSegments: number;
}
export interface ConeParams {
  radius: number;
  height: number;
  radialSegments: number;
}
export interface PlaneParams {
  width: number;
  depth: number;
  widthSegments: number;
  depthSegments: number;
}

export type Geometry =
  | {type:'capsule';params:{radius:number;length:number}}
  | {type:'frame';params:{width:number;height:number;depth:number;thickness:number}}
  | {type:'tube';params:{outerRadius:number;innerRadius:number;height:number}}
  | {type:'trapezoid';params:{widthTop:number;widthBottom:number;height:number;depth:number}}
  | { type: 'roundedPlate'; params: {width:number; height:number; depth:number; cornerRadius:number; holeRadius?:number} }
  | { type: 'box'; params: BoxParams }
  | { type: 'sphere'; params: SphereParams }
  | { type: 'cylinder'; params: CylinderParams }
  | { type: 'cone'; params: ConeParams }
  | { type: 'plane'; params: PlaneParams };

// 材质：MVP 限定标准 PBR 子集
export interface Material {
  id: string;
  baseColor: string; // hex, e.g. #9099A4
  roughness: number; // [0,1]
  metalness: number; // [0,1]
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number; // [0,1]，默认 1
}

// 资产引用（导入的 GLB 等），P3 才实现导入；此处保留契约
export interface AssetRef {
  id: string;
  relativePath: string;
  sha256: string; // 64 hex chars
  mediaType: string;
  bytes: number;
  sourceName: string;
  importedAt: string; // ISO 8601
  licenseNote: string;
}

export const SCENE_ROLES=['equipment','conveyor','workstation','storage','person','safety','building','floor','transport','other'] as const;
export type SceneRole=typeof SCENE_ROLES[number];
export type SceneNodeKind = 'primitive' | 'asset' | 'group';

export interface SceneNode {
  id: string; // 全项目唯一且稳定；名称不承担身份
  parentId: string | null;
  assemblyName?: string;
  sceneRole?:SceneRole;
  planKey?:string;
  zone?: string;
  label?: string;
  assemblyId?: string; // Flat editable equipment assembly, no transform hierarchy
  name: string;
  kind: SceneNodeKind;
  geometry?: Geometry; // kind === 'primitive'
  assetId?: string; // kind === 'asset'
  materialId?: string; // kind === 'primitive' 或带材质覆盖
  transform: Transform; // 相对父节点
  visible: boolean;
  locked?: boolean;
}

export interface ViewState {
  cameraPosition: Vec3;
  cameraTarget: Vec3;
  projection: 'perspective' | 'orthographic';
  displayUnit: Unit;
}

export interface SceneDocument {
  animation?:AnimationProgram;
  schemaVersion: number;
  projectId: string;
  revision: number; // 每次提交递增；撤销也生成新 revision
  unit: Unit;
  upAxis: UpAxis;
  materials: Material[];
  assets: AssetRef[];
  nodes: SceneNode[];
  viewState?: ViewState; // 视图状态独立保存，不属于建模语义
}

// ============ 校验（方案第 4 节：未知节点类型、循环层级、重复 ID、悬空引用、
// NaN、无穷值、负尺寸和超预算细分全部拒绝）============

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateVec3(v: Vec3, field: string): Error[] {
  const errs: Error[] = [];
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isFiniteNumber)) {
    errs.push(new Error(`${field} 必须是 3 个有限数字`));
  }
  return errs;
}

export function validateQuaternion(q: Quaternion, field: string): Error[] {
  const errs: Error[] = [];
  if (!Array.isArray(q) || q.length !== 4 || !q.every(isFiniteNumber)) {
    errs.push(new Error(`${field} 必须是 4 个有限数字 [x,y,z,w]`));
    return errs;
  }
  const norm = Math.hypot(q[0], q[1], q[2], q[3]);
  if (Math.abs(norm - 1) > 1e-3) {
    errs.push(new Error(`${field} 四元数未归一化（模长 ${norm.toFixed(6)}）`));
  }
  return errs;
}

// 几何参数校验：有限、非负、超预算细分拒绝
export function validateGeometry(g: Geometry): Error[] {
  const errs: Error[] = [];
  const required: Record<GeometryType, string[]> = {
    capsule:['radius','length'],frame:['width','height','depth','thickness'],tube:['outerRadius','innerRadius','height'],trapezoid:['widthTop','widthBottom','height','depth'],
    roundedPlate: ['width','height','depth','cornerRadius'], box: ['width', 'height', 'depth'], sphere: ['radius'],
    cylinder: ['radiusTop', 'radiusBottom', 'height'], cone: ['radius', 'height'], plane: ['width', 'depth'],
  };
  if (!g || !required[g.type] || !g.params || typeof g.params !== 'object') return [new Error('几何类型或参数结构无效')];
  const parameters = g.params as unknown as Record<string, number>;
  for (const key of required[g.type]) {
    if (!isFiniteNumber(parameters[key])) errs.push(new Error(`几何 ${g.type} 缺少有效参数 ${key}`));
    else if (parameters[key] <= 0 && key !== 'radiusTop' && key !== 'radiusBottom') errs.push(new Error(`几何参数 ${key} 必须大于 0`));
  }
  if (g.type === 'cylinder' && g.params.radiusTop === 0 && g.params.radiusBottom === 0) errs.push(new Error('圆柱上下半径不能同时为 0'));

  if(g.type==='frame' && g.params.thickness>=Math.min(g.params.width,g.params.height)/2)errs.push(new Error('边框厚度必须小于宽高的一半，保留真实开口'));
  if(g.type==='tube' && g.params.innerRadius>=g.params.outerRadius)errs.push(new Error('管内半径必须小于外半径'));
  if(g.type==='box' && g.params.bevelRadius!==undefined && g.params.bevelRadius>Math.min(g.params.width,g.params.height,g.params.depth)/2)errs.push(new Error('倒角半径不能超过最短边一半'));
  if(g.type === 'roundedPlate') {
    const {width,depth,cornerRadius,holeRadius=0} = g.params;
    if(cornerRadius > Math.min(width,depth)/2) errs.push(new Error('圆角半径不能超过短边一半'));
    if(holeRadius >= Math.min(width,depth)/2) errs.push(new Error('开孔必须小于短边一半，不能切穿外轮廓'));
  }
  const p = g.params as unknown as Record<string, number>;
  const segLimits: Record<string, number> = {
    widthSegments: 256,
    heightSegments: 256,
    radialSegments: 256,
    depthSegments: 1024,
  };
  for (const [k, v] of Object.entries(p)) {
    if (!isFiniteNumber(v)) errs.push(new Error(`几何参数 ${k} 不是有限数字`));
    else if (v <= 0 && k !== 'radiusTop' && k !== 'radiusBottom' && k !== 'radius' && k !== 'holeRadius' && k !== 'bevelRadius') {
      // 半径允许趋近 0（锥尖），但仍需 >= 0
      errs.push(new Error(`几何参数 ${k} 必须为正数（收到 ${v}）`));
    } else if (v < 0) errs.push(new Error(`几何参数 ${k} 不能为负数（收到 ${v}）`));
    if (k in segLimits && v > segLimits[k]) {
      errs.push(new Error(`几何参数 ${k} 超出预算上限 ${segLimits[k]}（收到 ${v}）`));
    }
  }
  return errs;
}

export function validateMaterial(m: Material): Error[] {
  const errs: Error[] = [];
  if (!m || typeof m.id !== 'string' || !m.id) errs.push(new Error('材质缺少 id'));
  if (!HEX_COLOR.test(m.baseColor ?? '')) errs.push(new Error(`材质 ${m.id ?? '?'} baseColor 不是合法 hex 颜色`));
  if (!isFiniteNumber(m.roughness) || m.roughness < 0 || m.roughness > 1) errs.push(new Error(`材质 ${m.id} roughness 超出 [0,1]`));
  if (!isFiniteNumber(m.metalness) || m.metalness < 0 || m.metalness > 1) errs.push(new Error(`材质 ${m.id} metalness 超出 [0,1]`));
  if(m.emissive!==undefined&&!/^#[0-9a-f]{6}$/i.test(m.emissive))errs.push(new Error('发光颜色无效'));
  if(m.emissiveIntensity!==undefined&&(!isFiniteNumber(m.emissiveIntensity)||m.emissiveIntensity<0||m.emissiveIntensity>2))errs.push(new Error('发光强度需为0–2'));
  if (m.opacity !== undefined && (!isFiniteNumber(m.opacity) || m.opacity < 0 || m.opacity > 1)) {
    errs.push(new Error(`材质 ${m.id} opacity 超出 [0,1]`));
  }
  return errs;
}

export function validateNode(node: SceneNode): Error[] {
  const errs: Error[] = [];
  if (!node || !isValidId(node.id)) {
    errs.push(new Error(`节点 id 非法：${node?.id ?? '?'}`));
  }
  for(const key of ['assemblyName','zone','label','planKey'] as const)if(node[key]!==undefined&&(typeof node[key]!=='string'||node[key]!.length>200))errs.push(new Error('场景标注或分组名称无效'));
  if(node.sceneRole!==undefined&&!SCENE_ROLES.includes(node.sceneRole))errs.push(new Error('场景角色无效'));
  if(node.assemblyId!==undefined&&!isValidId(node.assemblyId))errs.push(new Error('设备组件标识无效'));
  if (typeof node.name !== 'string') errs.push(new Error(`节点 ${node?.id} name 不是字符串`));
  errs.push(...validateVec3(node.transform.position, `节点 ${node.id} position`));
  errs.push(...validateQuaternion(node.transform.rotationQuaternion, `节点 ${node.id} rotationQuaternion`));
  errs.push(...validateVec3(node.transform.scale, `节点 ${node.id} scale`));
  if (node.transform.scale.some((s) => s === 0)) {
    errs.push(new Error(`节点 ${node.id} scale 含 0 分量（奇异，禁止无损表示`));
  }
  if (node.kind === 'primitive') {
    if (!node.geometry) errs.push(new Error(`节点 ${node.id} 是 primitive 但缺 geometry`));
    else errs.push(...validateGeometry(node.geometry));
  }
  if (node.kind === 'asset' && !node.assetId) {
    errs.push(new Error(`节点 ${node.id} 是 asset 但缺 assetId`));
  }
  return errs;
}

// 整文档校验：重复 ID、循环层级、悬空引用（父 / 材质 / 资产）
export function validateDocument(doc: SceneDocument): Error[] {
  const errs: Error[] = [];
  if (!doc || doc.schemaVersion !== SCHEMA_VERSION) {
    errs.push(new Error(`schemaVersion 不匹配：期望 ${SCHEMA_VERSION}`));
    return errs;
  }
  if (!isFiniteNumber(doc.revision) || doc.revision < 0) errs.push(new Error('revision 非法'));
  const nodeIds = new Set<string>();
  const materialIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const m of doc.materials ?? []) {
    errs.push(...validateMaterial(m));
    if (materialIds.has(m.id)) errs.push(new Error(`材质 id 重复：${m.id}`));
    materialIds.add(m.id);
  }
  for (const a of doc.assets ?? []) assetIds.add(a.id);
  for (const n of doc.nodes ?? []) {
    errs.push(...validateNode(n));
    if (nodeIds.has(n.id)) errs.push(new Error(`节点 id 重复：${n.id}`));
    nodeIds.add(n.id);
    if (n.materialId && !materialIds.has(n.materialId)) {
      errs.push(new Error(`节点 ${n.id} 悬空引用材质 ${n.materialId}`));
    }
    if (n.assetId && !assetIds.has(n.assetId)) {
      errs.push(new Error(`节点 ${n.id} 悬空引用资产 ${n.assetId}`));
    }
  }
  // 父引用与循环层级
  for (const n of doc.nodes ?? []) {
    if (n.parentId !== null && !nodeIds.has(n.parentId)) {
      errs.push(new Error(`节点 ${n.id} 悬空引用父节点 ${n.parentId}`));
    }
    // 循环检测：沿父链上溯，最多 nodes 步
    let cur: string | null = n.id;
    const path = new Set<string>();
    for (let i = 0; i < (doc.nodes?.length ?? 0) + 1; i++) {
      if (cur === null) break;
      if (path.has(cur)) { errs.push(new Error(`检测到循环层级（涉及节点 ${cur}）`)); break; }
      path.add(cur);
      const node = doc.nodes?.find((x) => x.id === cur);
      cur = node ? node.parentId : null;
    }
  }
  errs.push(...validateAnimation(doc.animation,doc.nodes??[]));
  return errs;
}
