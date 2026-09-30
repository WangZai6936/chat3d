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

// 简单的中文关键词解析。真实实现由 LLM 完成，这里只保证命令链路可跑通
export function parseInput(text: string): ParsedIntent {
  const t = text.trim();
  const ops: Command[] = [];
  let summary = t;

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

  // ===== 工作台模板（方案示例任务：创建一个工作台）=====
  if (/工作台|桌子|台面/.test(t)) {
    const len = dim('长') ?? dim('长度') ?? 2.0;
    const wid = dim('宽') ?? dim('宽度') ?? 0.8;
    const hgt = dim('高') ?? dim('高度') ?? 0.75;
    const top: Command = {
      op: 'createPrimitive',
      name: '桌面',
      parentId: null,
      geometry: { type: 'box', params: { width: len, height: 0.05, depth: wid } },
      materialId: 'mat_gray',
      transform: {
        position: [0, hgt - 0.025, 0],
        rotationQuaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    };
    ops.push(top);
    // 四条桌腿
    const legH = hgt - 0.05;
    const lx = len / 2 - 0.05;
    const lz = wid / 2 - 0.05;
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 === 0 ? -lx : lx;
      const sz = i < 2 ? -lz : lz;
      ops.push({
        op: 'createPrimitive',
        name: `桌腿${i + 1}`,
        parentId: null,
        geometry: { type: 'cylinder', params: { radiusTop: 0.03, radiusBottom: 0.03, height: legH, radialSegments: 16 } },
        materialId: 'mat_gray',
        transform: {
          position: [sx, legH / 2, sz],
          rotationQuaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      });
    }
    summary = `创建工作台：长 ${len}m × 宽 ${wid}m × 高 ${hgt}m（桌面 + 4 桌腿）`;
    return { summary, operations: ops };
  }

  // ===== 简单立方体 =====
  if (/立方体|方块|盒子|箱子/.test(t)) {
    const size = dim('边长') ?? dim('大小') ?? dim('尺寸') ?? 1.0;
    ops.push({
      op: 'createPrimitive',
      name: '立方体',
      parentId: null,
      geometry: { type: 'box', params: { width: size, height: size, depth: size } },
      materialId: 'mat_blue',
      transform: { position: [0, size / 2, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    summary = `创建立方体：边长 ${size}m`;
    return { summary, operations: ops };
  }

  // ===== 圆柱 =====
  if (/圆柱|柱子|管子/.test(t)) {
    const r = dim('半径') ?? dim('半径') ?? 0.2;
    const h = dim('高') ?? dim('高度') ?? 1.0;
    ops.push({
      op: 'createPrimitive',
      name: '圆柱',
      parentId: null,
      geometry: { type: 'cylinder', params: { radiusTop: r, radiusBottom: r, height: h, radialSegments: 32 } },
      materialId: 'mat_gray',
      transform: { position: [0, h / 2, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    summary = `创建圆柱：半径 ${r}m × 高 ${h}m`;
    return { summary, operations: ops };
  }

  // ===== 球体 =====
  if (/球|球体/.test(t)) {
    const r = dim('半径') ?? dim('大小') ?? 0.3;
    ops.push({
      op: 'createPrimitive',
      name: '球体',
      parentId: null,
      geometry: { type: 'sphere', params: { radius: r, widthSegments: 32, heightSegments: 24 } },
      materialId: 'mat_blue',
      transform: { position: [0, r, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    summary = `创建球体：半径 ${r}m`;
    return { summary, operations: ops };
  }

  // ===== 选中对象的修改（局部修改：只改相关参数，不重新生成整场景）=====
  const selection = useEditorStore.getState().selection;
  const hasTarget = selection.length > 0;
  if (hasTarget) {
    const targetId = selection[0];
    // "把它加粗到 6 厘米" / "改粗到 X"
    if (/加粗|改粗|粗/.test(t)) {
      const r = (dim('到') ?? 0.03) / 2;
      ops.push({
        op: 'updateParameters',
        targetId,
        geometry: { type: 'cylinder', params: { radiusTop: r, radiusBottom: r, height: 0.75, radialSegments: 16 } },
      });
      summary = `将选中对象加粗至半径 ${r}m`;
      return { summary, operations: ops };
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
      ops.push({ op: 'translate', targetId, space: 'world', mode: 'delta', value: vec });
      summary = `将选中对象${dir}移动 ${meters}m（世界坐标）`;
      return { summary, operations: ops };
    }
    // "改成红色/蓝色"
    if (/红色|红/.test(t)) {
      ops.push({ op: 'setMaterial', targetId, materialId: 'mat_blue' });
      summary = '将选中对象改为蓝色材质';
      return { summary, operations: ops };
    }
    if (/灰色|灰/.test(t)) {
      ops.push({ op: 'setMaterial', targetId, materialId: 'mat_gray' });
      summary = '将选中对象改为灰色材质';
      return { summary, operations: ops };
    }
    // 重命名
    const renameMatch = t.match(/(改名|重命名|叫)\s*["""]?([^"""]+)["""]?/);
    if (renameMatch) {
      ops.push({ op: 'rename', targetId, name: renameMatch[2].trim() });
      summary = `将选中对象重命名为「${renameMatch[2].trim()}」`;
      return { summary, operations: ops };
    }
    // 隐藏/显示
    if (/隐藏|藏起来/.test(t)) {
      ops.push({ op: 'setVisibility', targetId, visible: false });
      summary = '隐藏选中对象';
      return { summary, operations: ops };
    }
    if (/显示|出来/.test(t)) {
      ops.push({ op: 'setVisibility', targetId, visible: true });
      summary = '显示选中对象';
      return { summary, operations: ops };
    }
  }

  // 未识别：不猜测、不执行（方案第 3 节：不从任意自然语言中猜命令）
  return { summary: '未能理解该指令。可试试：「创建一个工作台」「创建 1 米立方体」「选中对象后说：把它加粗到 6 厘米」', operations: [] };
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
