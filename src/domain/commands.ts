// 命令系统（方案第 6 节）
// - 每个命令有固定参数 schema、目标类型限制、影响集计算、成本估计与逆操作
// - 一次 AI 批量修改 = 一条历史记录；命令串行提交，原子生效
// - 批量生成的 ID 由应用分配，不能相信模型生成的 ID
import { makeId } from '../util/ids';
import {
  Geometry,
  Material,
  Quaternion,
  SceneDocument,
  SceneNode,
  Transform,
  Vec3,
  validateDocument,
} from './types';

// 单位修饰：世界空间修改需要父矩阵可逆；MVP 一层分组，直接按世界处理。
export type Space = 'world' | 'local';
export type TransformMode = 'set' | 'delta'; // set=移动到，delta=移动了。禁止混用

// 命令白名单（方案第一版开放集合的 P0 子集）
export type CommandOp =
  | 'createPrimitive'
  | 'createTemplate'
  | 'instantiateAsset'
  | 'updateParameters'
  | 'setTransform'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'setMaterial'
  | 'rename'
  | 'setVisibility'
  | 'duplicate'
  | 'reparent'
  | 'delete';

export interface CreatePrimitiveCommand {
  op: 'createPrimitive';
  tempId?: string; // 模型给的临时 ID，由应用映射到正式 ID
  name: string;
  parentId: string | null;
  geometry: Geometry;
  materialId?: string;
  transform: Transform;
}
export interface CreateTemplateCommand {
  op: 'createTemplate';
  tempId?: string;
  templateId: string; // 如 'workbench'，确定性模板
  parameters: Record<string, number>;
  parentId?: string | null;
  position?: Vec3; // 世界放置点
}
export interface InstantiateAssetCommand {
  op: 'instantiateAsset';
  tempId?: string;
  assetId: string; // 必须是已托管资产
  name?: string;
  parentId?: string | null;
  transform: Transform;
}
export interface UpdateParametersCommand {
  op: 'updateParameters';
  targetId: string;
  geometry?: Geometry; // 整体替换几何参数
  name?: string;
}
export interface SetTransformCommand {
  op: 'setTransform';
  targetId: string;
  transform: Transform;
}
export interface TranslateCommand {
  op: 'translate';
  targetId: string;
  space: Space;
  mode: TransformMode;
  value: Vec3; // 米
}
export interface RotateCommand {
  op: 'rotate';
  targetId: string;
  space: Space;
  mode: TransformMode;
  axis: Vec3; // 归一化轴
  angle: number; // 角度制
  quaternion?: Quaternion; // 优先于 axis/angle
}
export interface ScaleCommand {
  op: 'scale';
  targetId: string;
  mode: TransformMode;
  value: Vec3; // scale 比例
}
export interface SetMaterialCommand {
  op: 'setMaterial';
  targetId: string;
  materialId: string; // 必须已存在于 materials
}
export interface RenameCommand {
  op: 'rename';
  targetId: string;
  name: string;
}
export interface SetVisibilityCommand {
  op: 'setVisibility';
  targetId: string;
  visible: boolean;
}
export interface DuplicateCommand {
  op: 'duplicate';
  targetId: string;
  tempId?: string;
  offset?: Vec3; // 复制偏移，默认 [0,0,0]
}
export interface ReparentCommand {
  op: 'reparent';
  targetId: string;
  parentId: string | null;
  keepWorldTransform?: boolean; // false 时按局部处理
}
export interface DeleteCommand {
  op: 'delete';
  targetId: string;
}

export type Command =
  | CreatePrimitiveCommand
  | CreateTemplateCommand
  | InstantiateAssetCommand
  | UpdateParametersCommand
  | SetTransformCommand
  | TranslateCommand
  | RotateCommand
  | ScaleCommand
  | SetMaterialCommand
  | RenameCommand
  | SetVisibilityCommand
  | DuplicateCommand
  | ReparentCommand
  | DeleteCommand;

// AI 请求对应一个可验证事务（方案第 6 节）
export interface CommandBatch {
  requestId: string;
  projectId: string;
  baseRevision: number;
  selectedIds: string[];
  summary: string; // 模型给出的简短说明
  operations: Command[];
}

// ============ 影响 / 成本 ============
export function affectedNodeIds(op: Command, doc: SceneDocument): string[] {
  switch (op.op) {
    case 'createPrimitive':
    case 'createTemplate':
    case 'instantiateAsset':
      return [];
    case 'duplicate':
    case 'delete': {
      const ids = new Set<string>([op.targetId]);
      // delete 影响所有后代
      let added = true;
      while (added) {
        added = false;
        for (const n of doc.nodes) {
          if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
            ids.add(n.id);
            added = true;
          }
        }
      }
      return Array.from(ids);
    }
    default:
      return [op.targetId];
  }
}

interface Budget {
  maxCommands: number;
  maxNewNodes: number;
}
const DEFAULT_BUDGET: Budget = { maxCommands: 200, maxNewNodes: 1000 }; // 方案 11 节初始预算

export function estimateCost(ops: Command[]): { commands: number; newNodes: number } {
  let newNodes = 0;
  for (const op of ops) {
    if (op.op === 'createPrimitive' || op.op === 'instantiateAsset') newNodes += 1;
    if (op.op === 'createTemplate') newNodes += 8; // 模板上限粗估，实际由模板构建器精确计算
    if (op.op === 'duplicate') newNodes += 8;
  }
  return { commands: ops.length, newNodes };
}

// ============ 逆操作 ============
// 历史保存已接受命令及足够的 before/after 数据（方案第 6 节）
export interface CommandWithInverse {
  command: Command;
  before: { nodes: SceneNode[]; materialIds: string[] }; // 受影响节点快照 + 用到的材质
  after: { nodes: SceneNode[]; materialIds: string[] };
}

// ============ 执行 ============
// 所有编辑串行提交；这里做结构/引用/参数/权限/数量/资源成本校验
export interface ExecutionResult {
  doc: SceneDocument;
  applied: CommandWithInverse[];
  errors: Error[];
}

function cloneNode(n: SceneNode): SceneNode {
  return {
    ...n,
    transform: {
      position: [...n.transform.position] as Vec3,
      rotationQuaternion: [...n.transform.rotationQuaternion] as Quaternion,
      scale: [...n.transform.scale] as Vec3,
    },
    geometry: n.geometry ? cloneGeometry(n.geometry) : undefined,
  };
}

// 克隆 Geometry 保持判别联合完整（直接对象字面量会把 type 推断成宽联合）
export function cloneGeometry(g: Geometry): Geometry {
  return { type: g.type, params: { ...g.params } } as Geometry;
}

function findNode(doc: SceneDocument, id: string): SceneNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

export function applyCommand(doc: SceneDocument, op: Command): { doc: SceneDocument; inverse?: CommandWithInverse['before']; createdIds?: string[]; error?: Error } {
  // 目标存在性
  if ('targetId' in op) {
    if (!findNode(doc, op.targetId)) {
      return { doc, error: new Error(`命令 ${op.op} 的目标节点 ${op.targetId} 不存在`) };
    }
  }
  // 材质引用
  if (op.op === 'setMaterial') {
    if (!doc.materials.some((m) => m.id === op.materialId)) {
      return { doc, error: new Error(`材质 ${op.materialId} 不存在`) };
    }
  }
  // 资产引用
  if (op.op === 'instantiateAsset') {
    if (!doc.assets.some((a) => a.id === op.assetId)) {
      return { doc, error: new Error(`资产 ${op.assetId} 未托管，拒绝实例化`) };
    }
  }
  // 父引用
  const parentId = 'parentId' in op ? op.parentId : null;
  if (parentId && !findNode(doc, parentId)) {
    return { doc, error: new Error(`父节点 ${parentId} 不存在`) };
  }

  const nodes = doc.nodes.map(cloneNode);
  const beforeSnapshot = 'targetId' in op ? snapshotAffected(doc, op) : { nodes: [], materialIds: [] };

  let createdIds: string[] | undefined;

  switch (op.op) {
    case 'createPrimitive': {
      const id = makeId();
      createdIds = [id];
      const node: SceneNode = {
        id,
        parentId: op.parentId ?? null,
        name: op.name,
        kind: 'primitive',
        geometry: op.geometry,
        materialId: op.materialId ?? defaultMaterialId(doc),
        transform: op.transform,
        visible: true,
      };
      nodes.push(node);
      break;
    }
    case 'updateParameters': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      if (op.geometry) {
        if (n.kind !== 'primitive') return { doc, error: new Error(`节点 ${op.targetId} 不是基本体，不能改几何参数`) };
        n.geometry = cloneGeometry(op.geometry);
      }
      if (op.name !== undefined) n.name = op.name;
      break;
    }
    case 'setTransform': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      n.transform = {
        position: [...op.transform.position] as Vec3,
        rotationQuaternion: [...op.transform.rotationQuaternion] as Quaternion,
        scale: [...op.transform.scale] as Vec3,
      };
      break;
    }
    case 'translate': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      const [x, y, z] = n.transform.position;
      const [dx, dy, dz] = op.value;
      n.transform.position = (op.mode === 'delta' ? [x + dx, y + dy, z + dz] : [dx, dy, dz]) as Vec3;
      if (op.space !== 'world') {
        // MVP 一层分组场景 local≈world；标记不精确，后续矩阵层处理
      }
      break;
    }
    case 'rename': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      if (typeof op.name !== 'string' || !op.name.trim()) return { doc, error: new Error('rename 的 name 不能为空') };
      n.name = op.name;
      break;
    }
    case 'setVisibility': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      n.visible = op.visible;
      break;
    }
    case 'setMaterial': {
      const n = findNodeInList(nodes, op.targetId);
      if (!n) return { doc, error: new Error(`目标不存在: ${op.targetId}`) };
      n.materialId = op.materialId;
      break;
    }
    // createTemplate / instantiateAsset / duplicate / reparent / scale / rotate / delete
    // 在 commands-full 实现中补齐；P0 先跑通创建+修改主干
    default:
      return { doc, error: new Error(`命令 ${op.op} 尚未实现（P0 主干不含）`) };
  }

  const newDoc: SceneDocument = {
    ...doc,
    nodes,
    revision: doc.revision + 1,
  };
  const errs = validateDocument(newDoc);
  if (errs.length > 0) {
    return { doc, error: new Error(`提交后文档校验失败: ${errs.map((e) => e.message).join('; ')}`) };
  }
  return { doc: newDoc, inverse: beforeSnapshot, createdIds };
}

function findNodeInList(nodes: SceneNode[], id: string): SceneNode | undefined {
  return nodes.find((n) => n.id === id);
}

function defaultMaterialId(doc: SceneDocument): string | undefined {
  return doc.materials[0]?.id;
}

function snapshotAffected(doc: SceneDocument, op: Command): { nodes: SceneNode[]; materialIds: string[] } {
  const ids = new Set(affectedNodeIds(op, doc));
  const nodes = doc.nodes.filter((n) => ids.has(n.id)).map(cloneNode);
  const materialIds = Array.from(new Set(nodes.map((n) => n.materialId).filter((m): m is string => !!m)));
  return { nodes, materialIds };
}

function snapshotIds(doc: SceneDocument, ids: string[]): { nodes: SceneNode[]; materialIds: string[] } {
  const set = new Set(ids);
  const nodes = doc.nodes.filter((n) => set.has(n.id)).map(cloneNode);
  const materialIds = Array.from(new Set(nodes.map((n) => n.materialId).filter((m): m is string => !!m)));
  return { nodes, materialIds };
}

// 批量事务：任一失败整批回滚
export function applyBatch(doc: SceneDocument, batch: { operations: Command[] }): ExecutionResult {
  const applied: CommandWithInverse[] = [];
  const errors: Error[] = [];
  const cost = estimateCost(batch.operations);
  if (cost.commands > DEFAULT_BUDGET.maxCommands) {
    errors.push(new Error(`命令数 ${cost.commands} 超出预算 ${DEFAULT_BUDGET.maxCommands}`));
    return { doc, applied, errors };
  }
  if (cost.newNodes > DEFAULT_BUDGET.maxNewNodes) {
    errors.push(new Error(`新增节点估计 ${cost.newNodes} 超出预算 ${DEFAULT_BUDGET.maxNewNodes}`));
    return { doc, applied, errors };
  }

  let current = doc;
  for (const op of batch.operations) {
    const r = applyCommand(current, op);
    if (r.error) {
      errors.push(new Error(`操作 ${op.op} 失败: ${r.error.message}`));
      break; // 整批拒绝，current 不写回，正式场景与撤销栈都不变化
    }
    current = r.doc;
    if (r.inverse) {
      // create 类命令没有「受影响」节点：创建结果用新节点 id 快照，撤销时才删得掉
      const after = r.createdIds && r.createdIds.length > 0 ? snapshotIds(current, r.createdIds) : snapshotAffected(current, op);
      applied.push({ command: op, before: r.inverse, after });
    }
  }
  if (errors.length > 0) {
    return { doc, applied: [], errors }; // 丢弃副本，方案第 6 节：中途失败丢弃副本
  }
  return { doc: current, applied, errors };
}

// 材质创建（供模板/默认使用）
export function ensureMaterial(doc: SceneDocument, mat: Material): SceneDocument {
  if (doc.materials.some((m) => m.id === mat.id)) return doc;
  return { ...doc, materials: [...doc.materials, mat] };
}
