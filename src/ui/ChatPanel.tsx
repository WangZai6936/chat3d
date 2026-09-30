import { useEffect, useRef, useState } from 'react';
import { buildBatch } from '../ai/mockModel';
import { buildSceneContext, generateBatch, ModelConfig } from '../ai/provider';
import { applyBatch, CommandBatch } from '../domain/commands';
import { makeId } from '../util/ids';
import { AiTaskStatus, useEditorStore } from '../store';

// 对话面板（方案第 3 节）：自然语言输入 → AI 管线 → 命令批预览 → 确认/放弃
// - 生成阶段分路：配置完整且未开「离线演示」→ 调真实模型 API（OpenAI 兼容，可带图片）
//   开了「离线演示」→ 走内置模拟回包（不看图）；未配置 → 友好提示，不进入管线
// - 图片：📎 选图或直接粘贴，压缩到最长边 1024px 的 JPEG 随消息发出（需模型支持 vision）
// - 输入框处理中文输入法组合期（composition），组合中不发送
// - 请求串行：一次只处理一个事务（方案：一个 AI 请求 = 一个事务 = 一条历史）
// - 失败后允许继续输入：error / cancelled 不锁输入框（否则一次失败就卡死）
// - 取消请求会 abort 正在进行的网络请求（fetch AbortSignal）

const STATUS_TEXT: Record<AiTaskStatus, string> = {
  idle: '',
  capturing: '正在捕获请求上下文…',
  context: '正在组织场景上下文…',
  generating: '模型生成中…',
  validating: '正在校验命令批（结构 / 引用 / 预算）…',
  previewing: '预览已就绪：请在场景中查看，确认后写入历史',
  applying: '正在提交…',
  error: '处理失败',
  cancelled: '已取消',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_IMAGES = 4; // 单条消息最多附图数（避免请求体过大）

// 图片压缩：最长边 1024、JPEG 0.8。原始截图往往 2-5MB，base64 后更会撑爆请求体
async function compressImage(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法处理图片（浏览器不支持 canvas）');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function ChatPanel() {
  const messages = useEditorStore((s) => s.messages);
  const aiStatus = useEditorStore((s) => s.aiStatus);
  const aiError = useEditorStore((s) => s.aiError);
  const pendingBatch = useEditorStore((s) => s.pendingBatch);
  const addUserMessage = useEditorStore((s) => s.addUserMessage);
  const addAssistantMessage = useEditorStore((s) => s.addAssistantMessage);
  const setAiStatus = useEditorStore((s) => s.setAiStatus);
  const setAiError = useEditorStore((s) => s.setAiError);
  const setPendingBatch = useEditorStore((s) => s.setPendingBatch);
  const setPendingResult = useEditorStore((s) => s.setPendingResult);
  const setPreviewDoc = useEditorStore((s) => s.setPreviewDoc);
  const confirmPending = useEditorStore((s) => s.confirmPending);
  const discardPending = useEditorStore((s) => s.discardPending);

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const composingRef = useRef(false); // 输入法组合期标记
  const runIdRef = useRef(0); // 请求令牌：取消/重发时让旧请求的后续步骤失效
  const abortRef = useRef<AbortController | null>(null); // 正在进行的网络请求
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 新消息或状态变化时滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, aiStatus, attachments.length]);

  const busy =
    aiStatus === 'capturing' ||
    aiStatus === 'context' ||
    aiStatus === 'generating' ||
    aiStatus === 'validating' ||
    aiStatus === 'applying';

  // 添加图片（压缩后存 dataURL）
  const addImages = async (files: (File | Blob)[]) => {
    const imgs: string[] = [];
    for (const f of files) {
      if (attachments.length + imgs.length >= MAX_IMAGES) {
        addAssistantMessage(`一条消息最多附 ${MAX_IMAGES} 张图。`);
        break;
      }
      try {
        imgs.push(await compressImage(f));
      } catch (e) {
        addAssistantMessage(`图片处理失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (imgs.length) setAttachments((prev) => [...prev, ...imgs]);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) void addImages(files);
    e.target.value = ''; // 同一文件可重复选择
  };

  // 粘贴：剪贴板里有图片就直接收下
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItems = items.filter((it) => it.type.startsWith('image/'));
    if (imgItems.length === 0) return;
    e.preventDefault();
    void addImages(imgItems.map((it) => it.getAsFile()).filter((b): b is File => b !== null));
  };

  // 校验 + 预览：真实 API 与模拟回包共用同一段收尾逻辑
  // - 基线漂移：请求发出后场景被改过 → 整批作废重试（一个事务对应一个稳定基线）
  // - applyBatch dry-run：结构/引用/参数非法 → 拒绝，不进预览
  // - 空操作（闲聊、说明）→ 只回文本，不进预览
  const finalize = (batch: CommandBatch) => {
    setAiStatus('validating');
    const store = useEditorStore.getState();
    if (store.doc.revision !== batch.baseRevision) {
      const msg = '场景在请求期间已被修改，事务作废，请重试。';
      setAiError(msg);
      setAiStatus('error');
      addAssistantMessage(msg, undefined, msg);
      return;
    }
    const result = applyBatch(store.doc, { operations: batch.operations });
    if (result.errors.length > 0) {
      const msg = `命令批被拒绝（未应用到场景）：${result.errors.map((e) => e.message).join('；')}`;
      setAiError(msg);
      setAiStatus('error');
      addAssistantMessage(msg, undefined, msg);
      return;
    }

    // 空操作（如闲聊回复）：只回说明文本，不进入预览
    if (batch.operations.length === 0) {
      setAiError(null);
      setAiStatus('idle');
      addAssistantMessage(batch.summary);
      return;
    }

    // 预演成功：视口/对象树/属性面板切到预览副本，等用户确认
    setPendingBatch(batch);
    setPendingResult(result);
    setPreviewDoc(result.doc);
    setAiError(null);
    setAiStatus('previewing');
    addAssistantMessage(batch.summary, batch);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const sentImages = attachments;
    setInput('');
    setAttachments([]);
    addUserMessage(text || '（只发了图片，没有文字）');
    setAiError(null); // 新请求开始，清掉上一条错误

    // 本请求的令牌：被取消后后续 await 全部丢弃
    const myRun = ++runIdRef.current;
    const alive = () => runIdRef.current === myRun;

    // 配置分路：未配置 → 引导去工具栏配置；离线演示 → 模拟回包；其余 → 真实 API
    const cfg: ModelConfig | null = useEditorStore.getState().aiConfig;
    if (!cfg || cfg.useMock) {
      if (!cfg) {
        addAssistantMessage(
          '还没有配置模型。请点左上角工具栏「模型配置」，填入 API 地址、API Key 和模型名（兼容 OpenAI 协议的服务都行），保存后就能用真实模型生成了。',
        );
        return;
      }
      if (sentImages.length > 0) {
        addAssistantMessage('离线演示模式不看图：模拟回包只按文字解析。要识别图片，请在「模型配置」里关掉演示模式并配置支持看图的模型。');
        return;
      }
      // 离线演示模式：模拟回包（不联网）
      try {
        setAiStatus('capturing');
        await sleep(180);
        if (!alive()) return;
        setAiStatus('context');
        await sleep(180);
        if (!alive()) return;
        setAiStatus('generating');
        await sleep(450);
        if (!alive()) return;

        // 模拟回包：解析中文意图 → 命令批（含 projectId / baseRevision / 选择）
        const batch = buildBatch(text);
        if (!alive()) return;
        finalize(batch);
      } catch (err) {
        if (!alive()) return;
        const msg = `请求异常：${err instanceof Error ? err.message : String(err)}`;
        setAiError(msg);
        setAiStatus('error');
        addAssistantMessage(msg, undefined, msg);
      }
      return;
    }

    // 真实模型路径
    const missing = [
      !cfg.baseURL.trim() && 'API 地址',
      !cfg.apiKey.trim() && 'API Key',
      !cfg.model.trim() && '模型名',
    ].filter(Boolean);
    if (missing.length > 0) {
      addAssistantMessage(
        `模型配置不完整（缺${missing.join('、')}）。请点工具栏「模型配置」补全后再发送。`,
      );
      return;
    }

    try {
      // 速记本请求的基线：校验时发现漂移就整批作废
      setAiStatus('capturing');
      const baseRevision = useEditorStore.getState().doc.revision;
      const selection = [...useEditorStore.getState().selection];
      await sleep(60);
      if (!alive()) return;

      // 组织场景上下文（现有节点清单 + 选中对象）随提示词发给模型
      setAiStatus('context');
      const ctx = buildSceneContext(useEditorStore.getState().doc, selection);
      await sleep(60);
      if (!alive()) return;

      // 生成：POST {baseURL}/chat/completions；取消即 abort；图片走 vision 消息段
      setAiStatus('generating');
      const controller = new AbortController();
      abortRef.current = controller;
      const generated = await generateBatch(text, cfg, ctx, controller.signal, sentImages);
      abortRef.current = null;
      if (!alive()) return;

      // 组装事务：请求 ID / 基线 / 摘要都由应用侧管理，模型只负责内容
      const batch: CommandBatch = {
        requestId: makeId(),
        projectId: useEditorStore.getState().doc.projectId,
        baseRevision,
        selectedIds: selection,
        summary: generated.summary,
        operations: generated.operations,
      };
      if (!alive()) return;
      finalize(batch);
    } catch (err) {
      abortRef.current = null;
      if (!alive()) return; // 被取消的请求不报错
      const msg = `请求异常：${err instanceof Error ? err.message : String(err)}`;
      setAiError(msg);
      setAiStatus('error');
      addAssistantMessage(msg, undefined, msg);
    }
  };

  // 取消进行中的请求（预览态用「放弃」按钮，不走这里）
  const cancelRequest = () => {
    runIdRef.current++; // 旧请求的后续步骤全部作废
    abortRef.current?.abort(); // 掐断正在等待的网络响应
    abortRef.current = null;
    setAiStatus('cancelled');
    setTimeout(() => {
      if (useEditorStore.getState().aiStatus === 'cancelled') setAiStatus('idle');
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-[#20242b] text-gray-200">
      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6 leading-relaxed">
            向 AI 描述要创建或修改的对象，例如：
            <br />「创建一个工作台」「创建 0.5 米立方体」
            <br />也可以 📎 附图或直接粘贴图片：「照这张图搭一个货架」
            <br />选中对象后可以说：「把它加粗到 6 厘米」「向左移动 1 米」
          </div>
        ) : (
          messages.map((m) => {
            const isPreviewMsg =
              m.role === 'assistant' &&
              m.batch !== undefined &&
              pendingBatch?.requestId === m.batch.requestId &&
              aiStatus === 'previewing';
            return (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : m.error
                        ? 'bg-red-900/50 border border-red-700/50 text-red-200'
                        : 'bg-[#2c323b] text-gray-200'
                  }`}
                >
                  {m.text}
                  {isPreviewMsg && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={confirmPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded"
                      >
                        应用到场景
                      </button>
                      <button
                        onClick={discardPending}
                        className="bg-white/10 hover:bg-white/20 text-gray-200 text-xs px-3 py-1 rounded"
                      >
                        放弃
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 状态行 + 预览确认条 */}
      <div className="border-t border-black/30 px-3 py-1 flex items-center gap-2 text-xs">
        {busy && (
          <>
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 flex-1">{STATUS_TEXT[aiStatus]}</span>
            <button onClick={cancelRequest} className="text-gray-400 hover:text-white px-2">
              取消
            </button>
          </>
        )}
        {aiStatus === 'previewing' && pendingBatch && (
          <>
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-emerald-300 flex-1 truncate">
              预览中：{pendingBatch.summary}（{pendingBatch.operations.length} 个操作）
            </span>
            <button
              onClick={confirmPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-0.5 rounded"
            >
              确认应用
            </button>
            <button
              onClick={discardPending}
              className="bg-white/10 hover:bg-white/20 text-gray-200 text-xs px-3 py-0.5 rounded"
            >
              放弃
            </button>
          </>
        )}
        {aiStatus === 'error' && aiError && (
          <span className="text-red-400 flex-1 truncate" title={aiError}>
            {aiError}
          </span>
        )}
        {aiStatus === 'idle' && <span className="text-gray-600 flex-1">就绪</span>}
      </div>

      {/* 图片预览条 */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-2 pt-2 flex-wrap border-t border-black/30 bg-[#252A31]">
          {attachments.map((url, i) => (
            <div key={i} className="relative">
              <img
                src={url}
                alt={`附件${i + 1}`}
                className="w-16 h-16 object-cover rounded border border-white/20"
              />
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center"
                title="移除这张图"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="p-2 flex gap-2 border-t border-black/30 bg-[#252A31]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPickFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || attachments.length >= MAX_IMAGES}
          title={`附图（可选粘贴，最多 ${MAX_IMAGES} 张；需模型支持看图）`}
          className="self-end mb-0.5 px-2.5 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed rounded text-gray-300"
        >
          📎
        </button>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // 失败状态下重新打字即清错：对话框始终可用
            if (aiStatus === 'error' || aiStatus === 'cancelled') {
              setAiStatus('idle');
              setAiError(null);
            }
          }}
          onPaste={onPaste}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          onKeyDown={(e) => {
            // Enter 发送，Shift+Enter 换行；输入法组合期（拼音候选）不发送
            if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
              e.preventDefault();
              if (!busy) void send();
            }
          }}
          disabled={busy}
          rows={3}
          placeholder="描述要创建或修改的对象…（Enter 发送，Shift+Enter 换行，📎/粘贴 可附图）"
          className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={busy || (!input.trim() && attachments.length === 0)}
          className="self-stretch px-5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm"
        >
          发送
        </button>
      </div>
    </div>
  );
}
