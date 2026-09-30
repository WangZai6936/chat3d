import { useEffect, useRef, useState } from 'react';
import { buildBatch } from '../ai/mockModel';
import { applyBatch } from '../domain/commands';
import { AiTaskStatus, useEditorStore } from '../store';

// 对话面板（方案第 3 节）：自然语言输入 → 模拟 AI 管线 → 命令批预览 → 确认/放弃
// - 输入框处理中文输入法组合期（composition），组合中不发送
// - 请求串行：一次只处理一个事务（方案：一个 AI 请求 = 一个事务 = 一条历史）
// - 失败后允许继续输入：error / cancelled 不锁输入框（否则一次失败就卡死）

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
  const composingRef = useRef(false); // 输入法组合期标记
  const runIdRef = useRef(0); // 请求令牌：取消/重发时让旧请求的后续步骤失效
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息或状态变化时滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, aiStatus]);

  const busy =
    aiStatus === 'capturing' ||
    aiStatus === 'context' ||
    aiStatus === 'generating' ||
    aiStatus === 'validating' ||
    aiStatus === 'applying';

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    addUserMessage(text);
    setAiError(null); // 新请求开始，清掉上一条错误

    // 本请求的令牌：被取消后后续 await 全部丢弃
    const myRun = ++runIdRef.current;
    const alive = () => runIdRef.current === myRun;

    try {
      // 模拟 AI 管线各阶段（P0 模拟回包；P2 换成 OpenAI 兼容适配器，阶段状态机不变）
      setAiStatus('capturing');
      await sleep(180);
      if (!alive()) return;
      setAiStatus('context');
      await sleep(180);
      if (!alive()) return;
      setAiStatus('generating');
      await sleep(450);
      if (!alive()) return;

      // 生成：模拟模型解析中文意图 → 命令批（含 projectId / baseRevision / 选择）
      const batch = buildBatch(text);

      setAiStatus('validating');
      await sleep(220);
      if (!alive()) return;

      // 校验：在最新文档上 dry-run（请求发出后已过数秒，基线可能已变）
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

      // 空操作（如未识别指令）：只回说明文本，不进入预览
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
    } catch (err) {
      if (!alive()) return;
      const msg = `请求异常：${err instanceof Error ? err.message : String(err)}`;
      setAiError(msg);
      setAiStatus('error');
      addAssistantMessage(msg, undefined, msg);
    }
  };

  // 取消进行中的请求（预览态用「放弃」按钮，不走这里）
  const cancelRequest = () => {
    runIdRef.current++; // 旧请求的后续步骤全部作废
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

      {/* 输入区 */}
      <div className="p-2 flex gap-2 border-t border-black/30 bg-[#252A31]">
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
          placeholder="描述要创建或修改的对象…（Enter 发送，Shift+Enter 换行）"
          className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="self-stretch px-5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm"
        >
          发送
        </button>
      </div>
    </div>
  );
}
