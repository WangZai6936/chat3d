// 模拟模型回包（方案 P0：先用模拟回包跑通"验证、预览与撤销"，再接真实端点）
// 这是 AIAdapter 的离线替身：解析中文输入 → 生成合法命令批
// 真实适配器（src/ai/provider.ts）在 P2 接入，协议差异在适配器内处理
import { Command, CommandBatch } from '../domain/commands';
import { makeId } from '../util/ids';
import { useEditorStore } from '../store';

interface ParsedIntent {
  summary: string;
  operations: Command[];
}

// 绕 X 轴 -90° 的四元数：把竖直平面放成水平地面
const Q_FLOOR: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function box(
  name: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  materialId: string,
): Command {
  return {
    op: 'createPrimitive',
    name,
    parentId: null,
    geometry: { type: 'box', params: { width: w, height: h, depth: d } },
    materialId,
    transform: { position: [x, y, z], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

function cylinder(
  name: string,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  materialId: string,
  segments = 24,
): Command {
  return {
    op: 'createPrimitive',
    name,
    parentId: null,
    geometry: { type: 'cylinder', params: { radiusTop: r, radiusBottom: r, height: h, radialSegments: segments } },
    materialId,
    transform: { position: [x, y, z], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

export function parseInput(text: string): ParsedIntent {
  const t = text.trim();

  // 数字提取：如 "2米" "0.8米" "50厘米"
  const num = (re: RegExp): number | null => {
    const m = t.match(re);
    if (!m) return null;
    return parseFloat(m[1]);
  };

  // 尺寸关键词 → 米
  const dim = (label: string): number | null => {
    const cm = num(new RegExp(`${label}([0-9.]+)厘米`));
    if (cm !== null) return cm / 100;
    const m = num(new RegExp(`${label}([0-9.]+)米`));
    return m;
  };

  // ===== 闲聊 / 说明（不产生命令）=====
  if (/^(你好|您好|在吗|嗨|hi|hello)/i.test(t) && t.length < 16) {
    return { summary: '你好！我是建模助手。用自然语言告诉我你想创建或修改什么，例如「创建一个工作台」。', operations: [] };
  }
  if (/谢谢|多谢|谢了|辛苦/.test(t)) {
    return { summary: '不客气！有需要继续说。', operations: [] };
  }
  if (/你是谁|你能做什么|可以做什么|帮助|help|怎么用|用法/.test(t)) {
    return {
      summary:
        '我可以帮你搭工业/仓库场景。试试这些：\n创建类：「创建一个工作台」「创建 3 层货架」「创建油桶」「创建 0.5 米立方体」「创建围墙」「创建地面」\n修改类（先在左侧对象树点选对象）：「向左移动 1 米」「把它加粗到 6 厘米」「改成灰色」「重命名为 A 柱」「隐藏」\n其他：删除 / 复制 / 清空下一版支持（可先用工具栏撤销回退）',
      operations: [],
    };
  }

  // ===== 清空场景：delete 命令尚未实现，先文本告知 =====
  if (/清空|全部删除|删掉全部|删除所有/.test(t)) {
    return {
      summary: '删除与清空功能下一版支持。临时办法：用工具栏「↺ 撤销」逐步回退到空场景。',
      operations: [],
    };
  }

  // ===== 工作台模板（方案示例任务：创建一个工作台）=====
  if (/工作台|桌子|台面|操作台|钳工台/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 2.0;
    const wid = dim('宽') ?? dim('宽度') ?? 0.8;
    const hgt = dim('高') ?? dim('高度') ?? 0.75;
    const ops: Command[] = [box('桌面', len, 0.05, wid, 0, hgt - 0.025, 0, 'mat_gray')];
    // 四条桌腿
    const legH = hgt - 0.05;
    const lx = len / 2 - 0.05;
    const lz = wid / 2 - 0.05;
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 === 0 ? -lx : lx;
      const sz = i < 2 ? -lz : lz;
      ops.push(cylinder(`桌腿${i + 1}`, 0.03, legH, sx, legH / 2, sz, 'mat_gray', 16));
    }
    return {
      summary: `创建工作台：长 ${len}m × 宽 ${wid}m × 高 ${hgt}m（桌面 + 4 桌腿）`,
      operations: ops,
    };
  }

  // ===== 货架 / 储物架：4 立柱 + N 层板 =====
  if (/货架|架子|储物架|置物架|物料架|层架/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 1.2;
    const wid = dim('宽') ?? dim('宽度') ?? 0.4;
    const hgt = dim('高') ?? dim('高度') ?? 1.8;
    const layers = num(/(\d+)\s*层/) ?? 3;
    const ops: Command[] = [];
    const post = 0.04; // 立柱粗细
    const lx = len / 2 - post / 2;
    const lz = wid / 2 - post / 2;
    // 4 根立柱（贯穿全高）
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 === 0 ? -lx : lx;
      const sz = i < 2 ? -lz : lz;
      ops.push(box(`立柱${i + 1}`, post, hgt, post, sx, hgt / 2, sz, 'mat_gray'));
    }
    // 层板：从底到顶均分
    for (let l = 0; l < layers; l++) {
      const y = (hgt / (layers - 1 || 1)) * l;
      const thick = 0.03;
      ops.push(box(`层板${l + 1}`, len, thick, wid, 0, y + thick / 2, 0, 'mat_blue'));
    }
    return {
      summary: `创建货架：长 ${len}m × 宽 ${wid}m × 高 ${hgt}m（4 立柱 + ${layers} 层板）`,
      operations: ops,
    };
  }

  // ===== 托盘 =====
  if (/托盘|栈板/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 1.2;
    const wid = dim('宽') ?? dim('宽度') ?? 0.8;
    const hgt = dim('高') ?? dim('高度') ?? 0.15;
    return {
      summary: `创建托盘：${len}m × ${wid}m × ${hgt}m`,
      operations: [box('托盘', len, hgt, wid, 0, hgt / 2, 0, 'mat_gray')],
    };
  }

  // ===== 柜子 / 储物柜 =====
  if (/柜子|储物柜|工具柜|柜|更衣柜/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 0.8;
    const wid = dim('宽') ?? dim('宽度') ?? 0.5;
    const hgt = dim('高') ?? dim('高度') ?? 1.8;
    return {
      summary: `创建储物柜：${len}m × ${wid}m × ${hgt}m`,
      operations: [box('储物柜', len, hgt, wid, 0, hgt / 2, 0, 'mat_blue')],
    };
  }

  // ===== 桶 / 油桶 / 圆桶 =====
  if (/油桶|圆桶|水桶|桶/.test(t)) {
    const r = dim('半径') ?? dim('口径') ?? 0.3;
    const h = dim('高') ?? dim('高度') ?? 0.8;
    return {
      summary: `创建桶：半径 ${r}m × 高 ${h}m`,
      operations: [cylinder('桶', r, h, 0, h / 2, 0, 'mat_blue')],
    };
  }

  // ===== 锥 / 圆锥 / 漏斗 =====
  if (/圆锥|锥体|锥|漏斗|警示锥|路锥/.test(t)) {
    const r = dim('半径') ?? dim('底') ?? 0.2;
    const h = dim('高') ?? dim('高度') ?? 0.5;
    return {
      summary: `创建圆锥：底半径 ${r}m × 高 ${h}m`,
      operations: [
        {
          op: 'createPrimitive',
          name: '圆锥',
          parentId: null,
          geometry: { type: 'cone', params: { radius: r, height: h, radialSegments: 32 } },
          materialId: 'mat_blue',
          transform: { position: [0, h / 2, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
      ],
    };
  }

  // ===== 简单立方体 =====
  if (/立方体|方块|盒子|箱子|箱/.test(t)) {
    const size = dim('边长') ?? dim('大小') ?? dim('尺寸') ?? 1.0;
    return {
      summary: `创建立方体：边长 ${size}m`,
      operations: [box('立方体', size, size, size, 0, size / 2, 0, 'mat_blue')],
    };
  }

  // ===== 圆柱 =====
  if (/圆柱|柱子|管子|柱/.test(t)) {
    const r = dim('半径') ?? 0.2;
    const h = dim('高') ?? dim('高度') ?? 1.0;
    return {
      summary: `创建圆柱：半径 ${r}m × 高 ${h}m`,
      operations: [cylinder('圆柱', r, h, 0, h / 2, 0, 'mat_gray')],
    };
  }

  // ===== 球体 =====
  if (/球|球体/.test(t)) {
    const r = dim('半径') ?? dim('大小') ?? 0.3;
    return {
      summary: `创建球体：半径 ${r}m`,
      operations: [
        {
          op: 'createPrimitive',
          name: '球体',
          parentId: null,
          geometry: { type: 'sphere', params: { radius: r, widthSegments: 32, heightSegments: 24 } },
          materialId: 'mat_blue',
          transform: { position: [0, r, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
      ],
    };
  }

  // ===== 墙 / 隔板 =====
  if (/墙|隔墙|围墙|隔断/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 2.0;
    const hgt = dim('高') ?? dim('高度') ?? 1.2;
    const thick = dim('厚') ?? dim('厚度') ?? 0.1;
    return {
      summary: `创建墙：长 ${len}m × 高 ${hgt}m × 厚 ${thick}m`,
      operations: [box('墙', len, hgt, thick, 0, hgt / 2, 0, 'mat_gray')],
    };
  }

  // ===== 地面 / 地板 / 平台（水平平面）=====
  if (/地面|地板|平台|地坪/.test(t)) {
    const w = dim('宽') ?? dim('宽度') ?? 10.0;
    const d = dim('深') ?? dim('长度') ?? dim('长') ?? 10.0;
    return {
      summary: `创建地面：宽 ${w}m × 深 ${d}m`,
      operations: [
        {
          op: 'createPrimitive',
          name: '地面',
          parentId: null,
          geometry: { type: 'plane', params: { width: w, depth: d, widthSegments: 1, depthSegments: 1 } },
          materialId: 'mat_gray',
          transform: { position: [0, 0, 0], rotationQuaternion: Q_FLOOR, scale: [1, 1, 1] },
        },
      ],
    };
  }

  // ===== 选中对象的修改（局部修改：只改相关参数，不重新生成整场景）=====
  const selection = useEditorStore.getState().selection;
  const hasTarget = selection.length > 0;
  if (hasTarget) {
    const targetId = selection[0];
    // 删除 / 复制：delete、duplicate 命令尚未实现，先文本告知（避免产出非法命令批）
    if (/删除|删掉|去掉/.test(t)) {
      return { summary: '删除功能下一版支持。临时办法：用工具栏「↺ 撤销」回退创建该对象的那一步。', operations: [] };
    }
    if (/复制|拷贝|再来一个/.test(t)) {
      return { summary: '复制功能下一版支持。临时办法：直接告诉我「创建一个 XXX」，我来新建。', operations: [] };
    }
    // "把它加粗到 6 厘米" / "改粗到 X"
    if (/加粗|改粗|粗/.test(t)) {
      const r = (dim('到') ?? 0.03) / 2;
      return {
        summary: `将选中对象加粗至半径 ${r}m`,
        operations: [
          {
            op: 'updateParameters',
            targetId,
            geometry: { type: 'cylinder', params: { radiusTop: r, radiusBottom: r, height: 0.75, radialSegments: 16 } },
          },
        ],
      };
    }
    // "向左/右/前/后移动 X 米"（含歧义的方向：世界轴，不猜视角）
    const moveMatch = t.match(/(向左|向右|向前|向后|往上|往下|向上|向下)\s*移动?\s*([0-9.]+)?\s*(米|厘米)?/);
    if (moveMatch) {
      const dist = moveMatch[2] ? parseFloat(moveMatch[2]) : 0.5;
      const unit = moveMatch[3] ?? '米';
      const meters = unit === '厘米' ? dist / 100 : dist;
      const dir = moveMatch[1];
      const vec: [number, number, number] =
        dir === '向左' ? [-meters, 0, 0]
        : dir === '向右' ? [meters, 0, 0]
        : dir === '向前' ? [0, 0, -meters]
        : dir === '向后' ? [0, 0, meters]
        : dir === '往上' || dir === '向上' ? [0, meters, 0]
        : [0, -meters, 0];
      return {
        summary: `将选中对象${dir}移动 ${meters}m（世界坐标）`,
        operations: [{ op: 'translate', targetId, space: 'world', mode: 'delta', value: vec }],
      };
    }
    // "改成红色/蓝色"
    if (/红色|红/.test(t)) {
      return { summary: '将选中对象改为蓝色材质', operations: [{ op: 'setMaterial', targetId, materialId: 'mat_blue' }] };
    }
    if (/灰色|灰/.test(t)) {
      return { summary: '将选中对象改为灰色材质', operations: [{ op: 'setMaterial', targetId, materialId: 'mat_gray' }] };
    }
    // 重命名
    const renameMatch = t.match(/(改名|重命名|叫)\s*["“]?([^"”]+)["”]?/);
    if (renameMatch) {
      const name = renameMatch[2].trim();
      return { summary: `将选中对象重命名为「${name}」`, operations: [{ op: 'rename', targetId, name }] };
    }
    // 隐藏/显示
    if (/隐藏|藏起来/.test(t)) {
      return { summary: '隐藏选中对象', operations: [{ op: 'setVisibility', targetId, visible: false }] };
    }
    if (/显示|出来/.test(t)) {
      return { summary: '显示选中对象', operations: [{ op: 'setVisibility', targetId, visible: true }] };
    }
  }

  // 未识别：不猜测、不执行（方案第 3 节：不从任意自然语言中猜命令）
  return {
    summary:
      '这句话我还没学会（模拟模型只认关键词；配置真实模型后由大模型理解任意说法）。可以试试：\n创建：「创建一个工作台」「创建 3 层货架」「创建油桶」「创建围墙」「创建地面」\n修改（先在左侧对象树点选对象）：「向左移动 1 米」「改成灰色」「重命名为 A」「隐藏」\n输入「帮助」查看完整清单。',
    operations: [],
  };
}

// 组装成事务（带 projectId / baseRevision / 选择）
export function buildBatch(text: string): CommandBatch {
  const { doc, selection } = useEditorStore.getState();
  const intent = parseInput(text);
  return {
    requestId: makeId(),
    projectId: doc.projectId,
    baseRevision: doc.revision,
    selectedIds: [...selection],
    summary: intent.summary,
    operations: intent.operations,
  };
}
