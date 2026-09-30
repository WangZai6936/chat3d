// 编辑器状态 — Zustand（React UI 外壳与 Three.js 视口共享的储物间）
// - SceneDocument 是唯一可信来源；UI 状态（选择/面板）与项目状态（几何/层级/材质）分开
// - 一次 AI 批量修改 = 一条历史记录；拖动手柄松开时提交一条
// - 历史条数与字节数双限制（方案第 6 节）
import { create } from 'zustand';
import { applyBatch, cloneGeometry, Command, CommandBatch, CommandWithInverse, ExecutionResult } from './domain/commands';
import { Material, Quaternion, SceneDocument, SceneNode, SCHEMA_VERSION, Vec3 } from './domain/types';
import { makeId } from './util/ids';

// 方案第 7 节托管项目目录的默认材质
const MAT_GRAY: Material = { id: 'mat_gray', baseColor: '#9099A4', roughness: 0.6, metalness: 0.2 };
const MAT_BLUE: Material = { id: 'mat_blue', baseColor: '#3B6EA5', roughness: 0.5, metalness: 0.3 };

// 历史限制：条数与字节双计算（方案第 6 节）
const MAX_HISTORY_ENTRIES = 200;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024; // 64MB

export function createInitialDoc(): SceneDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: makeId(),
    revision: 0,
    unit: 'm',
    upAxis: 'Y',
    materials: [MAT_GRAY, MAT_BLUE],
    assets: [],
    nodes: [],
  };
}

export type AiTaskStatus =
  | 'idle'
  | 'capturing' // 冻结 projectId/baseRevision/选择/相机基准
  | 'context' // 组织发送上下文
  | 'generating' // 模型生成中
  | 'validating' // 结构/引用/参数/预算校验
  | 'previewing' // 副本预演，等用户确认应用
  | 'applying' // 原子提交
  | 'error'
  | 'cancelled';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  batch?: CommandBatch; // assistant 附带的命令批（预览态）
  error?: string;
  createdAt: number;
}

interface HistoryEntry {
  summary: string;
  applied: CommandWithInverse[]; // before/after 快照
  docAfter: SceneDocument;
  bytes: number;
}

interface EditorState {
  // 项目状态（进入核心命令历史）
  doc: SceneDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dirty: boolean; // 未保存标记

  // 会话状态（不进项目历史）
  selection: string[];
  messages: ChatMessage[];
  aiStatus: AiTaskStatus;
  pendingBatch: CommandBatch | null; // 预览中的批次
  pendingResult: ExecutionResult | null; // 预演结果：确认后原样提交（新建节点 ID 与预览一致）
  previewDoc: SceneDocument | null; // 预览期间驱动视口/面板的副本
  aiConfig: ModelConfig | null; // 模型 API 配置（baseURL / apiKey / model / useMock）
  setAiConfig: (cfg: ModelConfig | null) => void;
  aiError: string | null;

  // 应用偏好
  displayUnit: 'm' | 'cm' | 'mm';

  // 动作
  applyCommandBatch: (ops: Command[], summary: string) => { ok: boolean; error?: string };
  confirmPending: () => void;
  discardPending: () => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[] | null) => void;
  addUserMessage: (text: string) => void;
  addAssistantMessage: (text: string, batch?: CommandBatch, error?: string) => void;
  setAiStatus: (s: AiTaskStatus) => void;
  setPendingBatch: (batch: CommandBatch | null) => void;
  setPendingResult: (r: ExecutionResult | null) => void;
  setPreviewDoc: (d: SceneDocument | null) => void;
  setAiError: (e: string | null) => void;
}

function entryBytes(applied: CommandWithInverse[]): number {
  return JSON.stringify(applied).length;
}

function pushHistory(past: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  let next = [...past, entry];
  while (next.length > MAX_HISTORY_ENTRIES) next.shift();
  let total = next.reduce((s, e) => s + e.bytes, 0);
  while (total > MAX_HISTORY_BYTES && next.length > 1) {
    const removed = next.shift();
    if (!removed) break;
    total -= removed.bytes;
  }
  return next;
}

// 模型配置持久化：localStorage（桌面单用户应用；API Key 明文本地存储，
// P3 可升级到系统密钥链 / Tauri Stronghold）
const CONFIG_KEY = 'chat3d.modelConfig';
import type { ModelConfig } from './ai/provider';
function loadConfig(): ModelConfig | null {
  try {
    const s = localStorage.getItem(CONFIG_KEY);
    if (!s) return null;
    const c = JSON.parse(s) as Partial<ModelConfig>;
    if (typeof c.baseURL !== 'string' || typeof c.apiKey !== 'string' || typeof c.model !== 'string') return null;
    return { baseURL: c.baseURL, apiKey: c.apiKey, model: c.model, useMock: c.useMock === true };
  } catch {
    return null;
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: createInitialDoc(),
  past: [],
  future: [],
  dirty: false,
  selection: [],
  messages: [],
  aiStatus: 'idle',
  pendingBatch: null,
  pendingResult: null,
  previewDoc: null,
  aiConfig: loadConfig(),

  setAiConfig: (cfg) => {
    set({ aiConfig: cfg });
    try {
      if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      else localStorage.removeItem(CONFIG_KEY);
    } catch {
      // 存储失败不阻塞使用
    }
  },
  aiError: null,
  displayUnit: 'm',

  // 手动编辑（属性面板/对象树）的单一提交入口：原子替换，进历史
  // 预览期间冻结：AI 事务未确认前不能动手改基线
  applyCommandBatch: (ops: Command[], summary: string) => {
    const state = get();
    if (state.aiStatus === 'applying') return { ok: false, error: '已有提交进行中' };
    if (state.aiStatus === 'previewing') return { ok: false, error: '预览待确认：请先确认或放弃当前预览' };
    const result = applyBatch(state.doc, { operations: ops });
    if (result.errors.length > 0) {
      return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
    }
    const entry: HistoryEntry = {
      summary,
      applied: result.applied,
      docAfter: result.doc,
      bytes: entryBytes(result.applied),
    };
    set({
      doc: result.doc,
      past: pushHistory(state.past, entry),
      future: [],
      dirty: true,
      pendingBatch: null,
      aiStatus: 'idle',
    });
    return { ok: true };
  },

  // AI 事务确认：直接采用预演结果对象，不重跑 applyBatch
  // → 预览看到什么，提交就是什么；新建节点 ID 在预览/正式态完全一致
  confirmPending: () => {
    const { pendingBatch, pendingResult } = get();
    if (!pendingBatch || !pendingResult) return;
    // 防御：预览期间若文档被其他途径改动（界面已禁编辑，理论上走不到）
    if (get().doc.revision !== pendingBatch.baseRevision) {
      set({
        aiError: '场景在预览期间已变更，预览作废',
        aiStatus: 'error',
        pendingBatch: null,
        pendingResult: null,
        previewDoc: null,
      });
      return;
    }
    const entry: HistoryEntry = {
      summary: pendingBatch.summary,
      applied: pendingResult.applied,
      docAfter: pendingResult.doc,
      bytes: entryBytes(pendingResult.applied),
    };
    set((s) => ({
      doc: pendingResult.doc,
      past: pushHistory(s.past, entry),
      future: [],
      dirty: true,
      pendingBatch: null,
      pendingResult: null,
      previewDoc: null,
      aiStatus: 'idle',
      aiError: null,
    }));
  },

  discardPending: () => {
    set({ pendingBatch: null, pendingResult: null, previewDoc: null, aiStatus: 'idle', aiError: null });
  },

  undo: () => {
    const { past, future, doc, aiStatus } = get();
    if (aiStatus === 'previewing') return; // 预览期间冻结历史，避免基线漂移
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const restored = restoreFromBefore(doc, entry);
    set({
      doc: restored,
      past: past.slice(0, -1),
      future: [...future, entry],
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, aiStatus } = get();
    if (aiStatus === 'previewing') return;
    if (future.length === 0) return;
    const entry = future[future.length - 1];
    set({
      doc: entry.docAfter,
      past: [...past, entry],
      future: future.slice(0, -1),
      dirty: true,
    });
  },

  select: (ids) => set({ selection: ids ?? [] }),

  addUserMessage: (text) => {
    const msg: ChatMessage = { id: makeId(), role: 'user', text, createdAt: Date.now() };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  addAssistantMessage: (text, batch, error) => {
    const msg: ChatMessage = {
      id: makeId(),
      role: 'assistant',
      text,
      batch,
      error,
      createdAt: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  setAiStatus: (s) => set({ aiStatus: s }),
  setPendingBatch: (batch) => set({ pendingBatch: batch }),
  setPendingResult: (r) => set({ pendingResult: r }),
  setPreviewDoc: (d) => set({ previewDoc: d }),
  setAiError: (e) => set({ aiError: e }),
}));

// 从 before 快照恢复文档（撤销）
// - before 里有快照的节点：回写旧值（保留原 ID、父子、参数、材料）
// - after 里有但 before 里没有的节点：删除（即撤销创建）
function restoreFromBefore(doc: SceneDocument, entry: HistoryEntry): SceneDocument {
  const beforeNodes = new Map<string, SceneNode>();
  for (const item of entry.applied) {
    for (const n of item.before.nodes) beforeNodes.set(n.id, n);
  }
  const afterIds = new Set<string>();
  for (const item of entry.applied) {
    for (const n of item.after.nodes) afterIds.add(n.id);
  }

  const nodes = [...doc.nodes];
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (!afterIds.has(nodes[i].id)) continue;
    if (!beforeNodes.has(nodes[i].id)) nodes.splice(i, 1);
  }
  const restored = nodes.map((n) => {
    const snap = beforeNodes.get(n.id);
    return snap ? cloneSnapshot(snap) : n;
  });

  return { ...doc, nodes: restored, revision: doc.revision + 1 };
}

function cloneSnapshot(n: SceneNode): SceneNode {
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

// 预览期间用预演副本驱动视口与面板（所见即所得）；确认/放弃后自动回到真实文档
export function useDisplayDoc() {
  return useEditorStore((s) => s.previewDoc ?? s.doc);
}
