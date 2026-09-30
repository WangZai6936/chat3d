import { useEffect, useRef, useState } from 'react';
import { ModelConfig, fetchModels, testConnection } from '../ai/provider';
import { useEditorStore } from '../store';

// 模型配置对话框：OpenAI 兼容协议
// - baseURL / apiKey / model 保存在本机 localStorage（store.setAiConfig 负责持久化）
// - 填好地址和 Key 后自动调 /models 拉取模型列表（可输可选）；不支持该接口的服务可手动输入
// - 「测试连接」发一次最小请求验证配置可用
// - 「离线演示模式」走模拟回包，不联网（供无网环境体验链路；默认关）
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const aiConfig = useEditorStore((s) => s.aiConfig);
  const setAiConfig = useEditorStore((s) => s.setAiConfig);

  const [baseURL, setBaseURL] = useState(aiConfig?.baseURL ?? 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState(aiConfig?.apiKey ?? '');
  const [model, setModel] = useState(aiConfig?.model ?? '');
  const [useMock, setUseMock] = useState(aiConfig?.useMock ?? false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // null = 还没获取过；数组 = 已获取（可能为空，此时给手动输入的降级提示）
  const [modelList, setModelList] = useState<string[] | null>(null);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const refreshModels = async () => {
    if (useMock || fetching) return;
    setFetching(true);
    setFetchMsg(null);
    try {
      const r = await fetchModels({ baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: '', useMock: false });
      setModelList(r.models);
      setFetchMsg(r.error ? `模型列表获取失败：${r.error}（可直接手动输入模型名）` : `已获取 ${r.models.length} 个模型，可从列表选择或手动输入`);
    } finally {
      setFetching(false);
    }
  };

  // 对话框打开时若已填好地址和 Key，自动拉一次模型列表
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (autoFetchedRef.current || useMock) return;
    if (!baseURL.trim() || !apiKey.trim()) return;
    autoFetchedRef.current = true;
    void refreshModels();
    // 仅挂载时自动一次；之后改了地址/Key 可点「↻ 刷新」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    const cfg: ModelConfig = { baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim(), useMock };
    setAiConfig(cfg);
    onClose();
  };

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const cfg: ModelConfig = { baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim(), useMock: false };
      // 只验证网络连通与 key/模型名有效；不要求模型按 DSL 格式作答
      const r = await testConnection(cfg);
      setTestMsg({ ok: r.ok, text: r.text });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  // 输入框失焦时若两样都填了且还没拉到列表，顺手拉一次（地址/Key 改了想看新列表请点刷新）
  const onBlurTryFetch = () => {
    if (useMock || fetching) return;
    if (!baseURL.trim() || !apiKey.trim()) return;
    if (modelList && modelList.length > 0) return;
    void refreshModels();
  };

  const fetchOk = modelList !== null && modelList.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[480px] bg-[#252A31] text-gray-200 rounded-lg shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/40">
          <span className="font-bold tracking-wide">模型配置</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white px-2">✕</button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div>
            <label className="block text-xs text-gray-400 mb-1">API 地址（OpenAI 兼容）</label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              onBlur={onBlurTryFetch}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <div className="text-xs text-gray-500 mt-1">兼容 OpenAI 协议的服务都可填，如 OpenAI / DeepSeek / 公司内部网关，填到 /v1 这一级。</div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={onBlurTryFetch}
              placeholder="sk-..."
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <div className="text-xs text-gray-500 mt-1">只保存在本机，请求时作为 Bearer 头发出。</div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">模型名</label>
            <div className="flex gap-2">
              <input
                list="chat3d-model-options"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={() => void refreshModels()}
                disabled={fetching || useMock}
                title="重新从服务端拉取模型列表"
                className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {fetching ? '获取中…' : '↻ 刷新'}
              </button>
            </div>
            <datalist id="chat3d-model-options">
              {(modelList ?? []).map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            {fetchMsg ? (
              <div className={`text-xs mt-1 ${fetchOk ? 'text-emerald-400' : 'text-gray-500'}`}>{fetchMsg}</div>
            ) : (
              <div className="text-xs text-gray-500 mt-1">填好地址和 Key 后自动获取列表；也可直接手动输入。</div>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useMock}
              onChange={(e) => setUseMock(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="text-gray-200">离线演示模式（模拟回包）</span>
              <div className="text-xs text-gray-500 mt-0.5">不联网、不调用 API，用内置关键词解析。仅用于体验流程，生成质量有限。</div>
            </span>
          </label>

          {testMsg && (
            <div data-testid="test-result" className={`text-xs rounded px-3 py-2 ${testMsg.ok ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40' : 'bg-red-900/40 text-red-300 border border-red-700/40'}`}>
              {testMsg.text}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-black/40">
          <button
            onClick={() => void test()}
            disabled={testing || useMock}
            className="px-4 py-1.5 text-sm rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded bg-white/10 hover:bg-white/20"
            >
              取消
            </button>
            <button
              onClick={save}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
