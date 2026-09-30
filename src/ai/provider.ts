// 真实模型适配器（方案 P2，提前到本轮实现）
// OpenAI 兼容协议：POST {baseURL}/chat/completions
// - 系统提示词把 Scene DSL 讲清楚，模型输出结构化 JSON 命令批
// - 响应解析带容错与清洗：模型输出不可信，未知 op/坏参数一律丢弃并报错
// - 同一批次内模型可用 tempId 引用前面创建的节点（commands.applyBatch 负责映射）
import { Geometry, Transform } from '../domain/types';
import { Command } from '../domain/commands';

export interface ModelConfig {
  baseURL: string; // 如 https://api.openai.com/v1
  apiKey: string;
  model: string; // 如 gpt-4o-mini
  useMock: boolean; // 离线演示开关：true 时走模拟回包，不联网
}

export interface SceneContext {
  nodes: { id: string; name: string; desc: string; position: [number, number, number] }[];
  selection: string[];
}

export interface GeneratedBatch {
  summary: string;
  operations: Command[];
}

// OpenAI 兼容协议的多模态消息：user 消息可由文本段 + 图片段组成
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

// P0 已实现的命令集；模型若输出其他 op（rotate/scale/delete 等），解析层拦截
const IMPLEMENTED_OPS = new Set([
  'createPrimitive',
  'updateParameters',
  'setTransform',
  'translate',
  'rename',
  'setVisibility',
  'setMaterial',
]);

const GEOMETRY_TYPES = new Set(['box', 'sphere', 'cylinder', 'cone', 'plane']);

const KNOWN_MATERIALS = new Set(['mat_gray', 'mat_blue']);

const DEFAULT_TRANSFORM = {
  position: [0, 0, 0] as [number, number, number],
  rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
  scale: [1, 1, 1] as [number, number, number],
};

function buildSystemPrompt(ctx: SceneContext): string {
  const nodeLines = ctx.nodes.length
    ? ctx.nodes.map((n) => `  - id:${n.id} name:${n.name} (${n.desc}) pos:[${n.position.join(',')}]`).join('\n')
    : '  （空场景，还没有任何对象）';
  const sel = ctx.selection.length ? `选中的节点 id：${ctx.selection.join(', ')}` : '当前没有选中对象。';
  return `你是 chat3d 的三维建模助手。用户用中文描述需求，你把它转换成结构化的命令批 JSON。

# 坐标系与单位
- Y 轴向上，单位是米，世界原点在场景中心。
- 物体放置要符合物理常识：站在地上的物体底面 y=0（圆柱/桶放 y=半径或高度一半），桌面在桌腿上方。
- 复杂设备请拆成多个基本体（桌面+4桌腿、4立柱+N层板 等），一次全部输出。

# 图片
用户可能附图作为参考。看图估算尺寸（认常见物体比例：人、门、托盘等），仍只输出上面的命令；不确定时给合理默认值，并在 summary 里注明「按图片估算」。

# 输出格式（严格遵守）
只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字：
{"summary":"一句话中文说明做了什么","operations":[命令按执行顺序排列]}

# 支持的命令
1. 创建基本体：
   {"op":"createPrimitive","tempId":"t1","name":"桌面","parentId":null,"geometry":{"type":"box","params":{"width":2,"height":0.05,"depth":0.8}},"materialId":"mat_gray","transform":{"position":[0,0.725,0],"rotationQuaternion":[0,0,0,1],"scale":[1,1,1]}}
   - tempId：本批次内唯一标记，供后面命令引用。parentId 一般 null。
   - 几何类型与参数：
     box: width,height,depth
     cylinder: radiusTop,radiusBottom,height,radialSegments(建议 16-32)
     sphere: radius,widthSegments(建议 32),heightSegments(建议 24)
     cone: radius,height,radialSegments(建议 32)
     plane: width,depth,widthSegments,depthSegments（默认竖直。做地面/地板时用 rotationQuaternion [-0.7071,0,0,0.7071] 绕 X 轴放平，position y=0）
   - 材质只能二选一：mat_gray（灰）或 mat_blue（蓝）。没有更想要的颜色时，先选接近的。
2. 修改几何参数（整体替换）：{"op":"updateParameters","targetId":"t1","geometry":{...同上...}}
3. 设置变换（set 为绝对）：{"op":"setTransform","targetId":"t1","transform":{"position":[...],"rotationQuaternion":[0,0,0,1],"scale":[1,1,1]}}
4. 移动（delta 为增量，单位米）：{"op":"translate","targetId":"t1","space":"world","mode":"delta","value":[0.5,0,0]}
5. 重命名：{"op":"rename","targetId":"t1","name":"新名字"}
6. 显隐：{"op":"setVisibility","targetId":"t1","visible":false}
7. 材质：{"op":"setMaterial","targetId":"t1","materialId":"mat_blue"}

# targetId 规则
- 引用同批次里前面创建的节点：用它的 tempId（如 "t1"）。
- 引用场景里已有的节点：用真实 id（见下方场景上下文）。

# 当前版本不支持
旋转、缩放、复制、删除、分组（reparent）以及模板/资产命令——请只用上面 7 种命令表达。

# 场景上下文
${nodeLines}
${sel}`;
}

export function buildMessages(text: string, ctx: SceneContext, images: string[] = []): ChatMessage[] {
  const reminder = '\n\n（请只输出一个 JSON 命令批对象，不要 markdown 代码块或任何解释文字）';
  // 有图时 user 消息走多模态数组（OpenAI 兼容协议）；无图保持纯文本（兼容所有模型）
  const userContent: string | ContentPart[] = images.length
    ? [
        { type: 'text', text: text + reminder },
        ...images.map((url): ContentPart => ({ type: 'image_url', image_url: { url } })),
      ]
    : text + reminder;
  return [
    { role: 'system', content: buildSystemPrompt(ctx) },
    { role: 'user', content: userContent },
  ];
}

// ============ 响应解析与清洗 ============
// 导出纯函数便于单测；模型输出不可信，全部做兜底
export function parseModelResponse(raw: string): GeneratedBatch {
  const text = (raw ?? '').trim();
  if (!text) throw new Error('模型返回为空');

  // 去掉可能的 ```json ... ``` 包裹
  let body = text;
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();

  // 取第一个 { 到最后一个 }，容忍模型在 JSON 外多说话
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`模型返回中找不到 JSON 对象（模型可能用纯文字作了回答，没按格式输出）。原文前 160 字：${text.slice(0, 160)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new Error(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}。原文前 160 字：${(body.slice(start, end + 1)).slice(0, 160)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : '模型生成的命令批';
  const operations: Command[] = [];
  const warns: string[] = [];

  if (!Array.isArray(obj.operations)) throw new Error('模型返回的 operations 不是数组');

  for (const rawOp of obj.operations) {
    if (!rawOp || typeof rawOp !== 'object') continue;
    const op = rawOp as Record<string, unknown>;
    const opType = typeof op.op === 'string' ? op.op : '';
    if (!IMPLEMENTED_OPS.has(opType)) {
      warns.push(`跳过不支持的命令「${opType || '(空)'}」`);
      continue;
    }
    const cleaned = cleanCommand(opType, op);
    if (cleaned) operations.push(cleaned);
    else warns.push(`跳过参数不合法的命令「${opType}」`);
  }

  if (operations.length === 0) {
    throw new Error(warns.length ? `没有可执行的命令：${warns.join('；')}` : '模型没有生成任何命令');
  }
  return { summary: warns.length ? `${summary}（${warns.join('；')}）` : summary, operations };
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toVec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = toNum(v[0]);
  const b = toNum(v[1]);
  const c = toNum(v[2]);
  if (a === null || b === null || c === null) return null;
  return [a, b, c];
}

function cleanGeometry(raw: unknown): Geometry | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const type = typeof g.type === 'string' ? g.type : '';
  if (!GEOMETRY_TYPES.has(type)) return null;
  const paramsRaw = (g.params ?? {}) as Record<string, unknown>;
  const params: Record<string, number> = {};
  let ok = true;
  for (const [k, v] of Object.entries(paramsRaw)) {
    const n = toNum(v);
    if (n === null) {
      ok = false;
      break;
    }
    params[k] = n;
  }
  if (!ok || Object.keys(params).length === 0) return null;
  return { type: type as Geometry['type'], params } as unknown as Geometry;
}

function cleanTransform(raw: unknown): Transform {
  const t: Transform = {
    position: [...DEFAULT_TRANSFORM.position],
    rotationQuaternion: [...DEFAULT_TRANSFORM.rotationQuaternion],
    scale: [...DEFAULT_TRANSFORM.scale],
  };
  if (!raw || typeof raw !== 'object') return t;
  const r = raw as Record<string, unknown>;
  const p = toVec3(r.position);
  if (p) t.position = p;
  const s = toVec3(r.scale);
  if (s && s.every((x) => x > 0)) t.scale = s;
  if (Array.isArray(r.rotationQuaternion) && r.rotationQuaternion.length >= 4) {
    const q = r.rotationQuaternion.map(toNum);
    if (q.every((x) => x !== null)) t.rotationQuaternion = q as [number, number, number, number];
  }
  return t;
}

function cleanTargetId(op: Record<string, unknown>): string | null {
  const t = op.targetId;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function cleanCommand(opType: string, op: Record<string, unknown>): Command | null {
  switch (opType) {
    case 'createPrimitive': {
      const geometry = cleanGeometry(op.geometry);
      if (!geometry) return null;
      const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim() : '未命名';
      const materialId = typeof op.materialId === 'string' && KNOWN_MATERIALS.has(op.materialId) ? op.materialId : 'mat_gray';
      const transform = cleanTransform(op.transform);
      const cmd: Command = {
        op: 'createPrimitive',
        name,
        parentId: null,
        geometry,
        materialId,
        transform,
      };
      if (typeof op.tempId === 'string' && op.tempId.trim()) cmd.tempId = op.tempId.trim();
      return cmd;
    }
    case 'updateParameters': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      const geometry = cleanGeometry(op.geometry);
      const cmd: Command = { op: 'updateParameters', targetId, geometry: geometry ?? undefined };
      if (typeof op.name === 'string' && op.name.trim()) cmd.name = op.name.trim();
      return geometry || cmd.name !== undefined ? cmd : null;
    }
    case 'setTransform': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      return { op: 'setTransform', targetId, transform: cleanTransform(op.transform) };
    }
    case 'translate': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      const value = toVec3(op.value);
      if (!value) return null;
      const mode = op.mode === 'set' ? 'set' : 'delta';
      return { op: 'translate', targetId, space: 'world', mode, value };
    }
    case 'rename': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim() : null;
      if (!name) return null;
      return { op: 'rename', targetId, name };
    }
    case 'setVisibility': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      return { op: 'setVisibility', targetId, visible: op.visible !== false };
    }
    case 'setMaterial': {
      const targetId = cleanTargetId(op);
      if (!targetId) return null;
      const materialId = typeof op.materialId === 'string' && KNOWN_MATERIALS.has(op.materialId) ? op.materialId : 'mat_gray';
      return { op: 'setMaterial', targetId, materialId };
    }
    default:
      return null;
  }
}

// ============ 网络请求 ============
export async function generateBatch(
  text: string,
  cfg: ModelConfig,
  ctx: SceneContext,
  signal?: AbortSignal,
  images: string[] = [],
): Promise<GeneratedBatch> {
  const base = (cfg.baseURL || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置 API 地址（baseURL）');
  if (!cfg.apiKey.trim()) throw new Error('未配置 API Key');
  if (!cfg.model.trim()) throw new Error('未配置模型名');

  const url = `${base}/chat/completions`;
  const messages = buildMessages(text, ctx, images);

  // 解析失败自动纠偏重试一次：把模型的错误回复顶回去，再强调格式
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await fetchChat(url, cfg, messages, signal);
    try {
      return parseModelResponse(content);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === 0) {
        messages.push({ role: 'assistant', content: content.slice(0, 400) });
        messages.push({
          role: 'user',
          content: '上一条回复无法解析为 JSON 命令批。请严格只输出一个 JSON 对象：{"summary":"一句话说明做了什么","operations":[...] 同系统提示词的命令格式}，不要 markdown 代码块、不要任何解释或其他文字。',
        });
      }
    }
  }
  throw lastErr;
}

async function fetchChat(
  url: string,
  cfg: ModelConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: cfg.model.trim(),
      messages,
      temperature: 0.2,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`接口返回 HTTP ${res.status}：${detail.slice(0, 200) || res.statusText}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
  };
  const msg = data?.choices?.[0]?.message;
  let content = msg?.content;
  // 部分服务的思考型模型把最终答案放在 reasoning_content（content 为空）
  if (!content && typeof msg?.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    content = msg.reasoning_content;
  }
  if (!content || !content.trim()) throw new Error('接口没有返回消息内容');
  return content;
}

// 测试连接：只验证「能联通 + key 有效 + 模型名被服务方接受」
// 不要求模型按 DSL 格式回答（生成链路的 JSON 校验放在 chat 侧）
export async function testConnection(cfg: ModelConfig): Promise<{ ok: boolean; text: string }> {
  const base = (cfg.baseURL || '').trim().replace(/\/+$/, '');
  if (!base) return { ok: false, text: '未配置 API 地址（baseURL）' };
  if (!cfg.apiKey.trim()) return { ok: false, text: '未配置 API Key' };
  if (!cfg.model.trim()) return { ok: false, text: '未配置模型名' };
  const url = `${base}/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages: [{ role: 'user', content: 'ok' }],
        temperature: 0,
        stream: false,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, text: `HTTP ${res.status}：${httpHint(res.status)}${detail ? `（服务方返回：${detail.slice(0, 150)}）` : ''}` };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const msg = data?.choices?.[0]?.message;
    let content = msg?.content;
    // 思考型模型可能把答案放在 reasoning_content
    if (!content && typeof msg?.reasoning_content === 'string' && msg.reasoning_content.trim()) {
      content = msg.reasoning_content;
    }
    if (!content || !content.trim()) return { ok: false, text: '接口返回 200，但没有消息内容' };
    return { ok: true, text: `连接成功（模型回复：${content.trim().slice(0, 60)}）` };
  } catch (e) {
    return { ok: false, text: `请求没发出去：${e instanceof Error ? e.message : String(e)}。可能是地址拼写错误、网络不通，或服务方不支持跨域调用` };
  }
}

// 常见 HTTP 状态码的排查提示（面向非技术用户）
function httpHint(status: number): string {
  switch (status) {
    case 401:
      return 'API Key 无效或已过期，检查是否复制完整、带没带多余空格';
    case 403:
      return '服务方拒绝访问。常见原因：key 没有该模型权限、地域/来源被拦截（如直连境外服务无代理时会被云防护拦 403）、或账号额度不足';
    case 404:
      return '地址或模型不存在。确认 baseURL 填到 /v1 这一级，且模型名在该服务上确实存在';
    case 429:
      return '请求太频繁或额度已用完，稍后再试或更换 key';
    default:
      return '';
  }
}

// 构造场景上下文（ChatPanel 调用）
export function buildSceneContext(doc: { nodes: { id: string; name: string; geometry?: Geometry; transform: { position: [number, number, number] } }[] }, selection: string[]): SceneContext {
  return {
    nodes: doc.nodes.map((n) => {
      const g = n.geometry;
      const desc = g
        ? `${g.type} ${Object.entries(g.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}`
        : 'group';
      return { id: n.id, name: n.name, desc, position: n.transform.position };
    }),
    selection,
  };
}
