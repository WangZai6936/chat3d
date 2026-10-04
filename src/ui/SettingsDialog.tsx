import {normalizeTaskBudget} from '../ai/taskBudget';
import {SiteAccessRecovery} from './SiteAccessRecovery';
import {AGENT_LIMITS} from '../ai/agentPolicy';
import {Dialog} from '@radix-ui/themes';
import { useEffect, useRef, useState } from 'react';
import { ModelConfig, fetchModels, testConnection } from '../ai/provider';
import { useEditorStore } from '../store';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const config = useEditorStore((s) => s.aiConfig);
  const [baseURL, setBaseURL] = useState(config?.baseURL ?? 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '');
  const [model, setModel] = useState(config?.model ?? '');
  const [agentMode, setAgentMode] = useState<'pi'|'single'>(config?.agentMode ?? 'pi');
  const [taskBudget,setTaskBudget]=useState(()=>normalizeTaskBudget(config?.taskBudget));
  const [parallelDrafts,setParallelDrafts]=useState(config?.parallelDrafts===true);
  const [stream, setStream] = useState(config?.agentMode === 'single' ? config.stream !== false : true);
  const [models, setModels] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ok:boolean;text:string}|null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastCredentials = useRef('');
  const inputClass = 'w-full bg-black/30 border border-white/15 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400';
  const ready = !!baseURL.trim() && !!apiKey.trim();
  const valid = (ready && !!model.trim() && (manual || !!models?.includes(model)));

  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);
  const invalidate = () => {
    sequence.current++; controller.current?.abort(); setFetching(false); setTesting(false);
    setModels(null); setModel(''); setError(''); setResult(null); setManual(false); setQuery('');
    lastCredentials.current = '';
  };
  const load = async (force = true) => {
    if (!ready) return;
    const credentialId = `${baseURL.trim()}\n${apiKey.trim()}`;
    if (!force && lastCredentials.current === credentialId) return;
    lastCredentials.current = credentialId;
    const id = ++sequence.current;
    controller.current?.abort(); const c = new AbortController(); controller.current = c;
    setFetching(true); setError(''); setResult(null); setModels(null); setManual(false);
    const timeout = window.setTimeout(() => c.abort(), 20000);
    try {
      const r = await fetchModels({baseURL:baseURL.trim(),apiKey:apiKey.trim(),model:'',useMock:false}, c.signal);
      if (id !== sequence.current) return;
      setModels(r.models);
      if (r.error) { setError(c.signal.aborted ? '获取模型超时，请检查接口或稍后重试' : r.error); setModel(''); }
      else { setModel((previous) => r.models.includes(previous) ? previous : (r.models.length === 1 ? r.models[0] : '')); }
    } catch (e) { if (id === sequence.current) setError(e instanceof Error ? e.message : '获取模型失败'); }
    finally { window.clearTimeout(timeout); if (id === sequence.current) setFetching(false); }
  };
  useEffect(() => { if (ready) void load(true); }, []);
  const test = async () => {
    if (!valid) return;
    const id = ++sequence.current;
    controller.current?.abort(); const c = new AbortController(); controller.current = c;
    const timeout = window.setTimeout(() => c.abort(), 20000);
    setTesting(true); setResult(null);
    try {
      const r = await testConnection({baseURL:baseURL.trim(),apiKey:apiKey.trim(),model:model.trim(),useMock:false}, c.signal);
      if (id === sequence.current) setResult(c.signal.aborted ? {ok:false,text:'连接测试超时，请检查服务响应后重试'} : r);
    } finally { window.clearTimeout(timeout); if (id === sequence.current) setTesting(false); }
  };
  const save = () => {
    if (!valid) return;
    const cfg: ModelConfig = {taskBudget:normalizeTaskBudget(taskBudget),baseURL:baseURL.trim(),apiKey:apiKey.trim(),model:model.trim(),useMock:false,stream,agentMode,parallelDrafts:agentMode==='pi'&&parallelDrafts};
    useEditorStore.getState().setAiConfig(cfg); onClose();
  };
  const shown = (models ?? []).filter((id) => id.toLowerCase().includes(query.toLowerCase()));
  const originBlocked = error.includes('origin not allowed');
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}>
    <Dialog.Content aria-describedby={undefined} maxWidth="580px" style={{padding:0,maxHeight:'92vh',overflowY:'auto',background:'#19212c'}} onInteractOutside={e=>e.preventDefault()}>
      <header className="flex items-center justify-between px-5 py-4 border-b border-black/40">
        <Dialog.Title id="model-settings-title" className="font-bold text-lg" style={{margin:0}}>连接模型服务</Dialog.Title>
        <button aria-label="关闭模型配置" onClick={onClose} className="px-2 py-1">✕</button>
      </header>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-400">1. 填写接口和密钥　2. 获取并选择模型　3. 保存配置（可先测试连接）</p>
        <label className="block text-sm space-y-1"><span>API 根地址</span><input className={inputClass} type="url" value={baseURL} onChange={(e)=>{invalidate();setBaseURL(e.target.value);setApiKey('')}} onBlur={()=>void load(false)} placeholder="https://你的服务/v1" /><span className="block text-xs text-gray-400">填写到 /v1 或服务提供的 API 根路径，不要包含 /models 或 /chat/completions。更换地址后请重新输入对应密钥，避免将旧密钥发送给新服务</span></label>
        <label className="block text-sm space-y-1"><span>API Key</span><input className={inputClass} type="password" autoComplete="off" value={apiKey} onChange={(e)=>{invalidate();setApiKey(e.target.value)}} onBlur={()=>void load(false)} placeholder="填写服务提供的密钥" /></label>
        <p className="text-xs text-amber-200">密钥以明文保存在当前浏览器，请使用专用低额度密钥。支持自定义公网 HTTPS API。</p>
        <div className="space-y-3">
          <button onClick={()=>void load()} disabled={!ready || fetching} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-sm">{fetching ? '正在获取模型列表…' : models?.length ? '重新获取模型列表' : '获取可用模型'}</button>
          <SiteAccessRecovery error={error}/>
          {error && <div role="alert" className="text-sm p-3 bg-red-950/50 text-red-200 rounded break-words">{error}</div>}
          {!!models?.length && !manual && <>
            <label className="block text-sm space-y-1"><span>筛选模型（共 {models.length} 个）</span><input className={inputClass} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="输入名称筛选" /></label>
            <label className="block text-sm space-y-1"><span>选择模型</span><select className={inputClass} value={model} onChange={(e)=>{sequence.current++;controller.current?.abort();setTesting(false);setModel(e.target.value);setResult(null)}}><option value="">请选择一个模型</option>{model && !shown.includes(model) && <option value={model}>{model}（当前选择）</option>}{shown.map((id)=><option key={id} value={id}>{id}</option>)}</select></label>
            {shown.length === 0 && <p className="text-sm text-gray-400">没有匹配的模型，请修改筛选词</p>}
          </>}
          {!fetching && models !== null && !models.length && !originBlocked && !manual && <button className="text-sm text-blue-300 underline" onClick={()=>setManual(true)}>服务不提供列表？手动填写模型名</button>}
          {manual && <label className="block text-sm space-y-1"><span>手动模型名（请以服务文档为准）</span><input className={inputClass} value={model} onChange={(e)=>{sequence.current++;controller.current?.abort();setTesting(false);setResult(null);setModel(e.target.value)}} placeholder="服务实际支持的模型 ID" /></label>}
        </div>
        <details className="rounded border border-white/10 p-3 text-sm"><summary className="cursor-pointer">高级设置 · 执行方式与流式输出</summary><div className="mt-3 space-y-3">        <label className="block text-sm space-y-1"><span>建模执行方式</span><select aria-label="建模执行方式" className={inputClass} value={agentMode} onChange={e=>{setAgentMode(e.target.value as 'pi'|'single');if(e.target.value==='pi')setStream(true);}}><option value="pi">连续建模（推荐）</option><option value="single">单次生成（兼容模式）</option></select><span className="block text-xs text-gray-400">连续建模需要模型支持图片、工具调用与流式输出；在任务预算内有有效进展就继续，到限后保留未验收草稿。连续 {AGENT_LIMITS.noProgressTurns} 轮无进展或 {AGENT_LIMITS.consecutiveErrorTurns} 轮工具失败且无进展会暂停；连续 {AGENT_LIMITS.idleTimeoutMs/60000} 分钟无活动会停止。每轮最多 {AGENT_LIMITS.outputPerTurn} 输出 Token。会将场景截图发送至你配置的同一接口，实际费用以网关为准。</span></label>
        <fieldset disabled={agentMode!=='pi'} className="space-y-2 rounded border border-white/10 p-3"><legend>每次建模任务预算</legend>
          <label className="block">时间上限（分钟）<input aria-label="任务时间上限（分钟）" type="number" min="1" max="120" className={inputClass} value={taskBudget.maxMinutes} onChange={e=>setTaskBudget(b=>({...b,maxMinutes:Number(e.target.value)}))}/></label>
          <label className="block">模型请求轮数上限<input aria-label="任务轮数上限" type="number" min="1" max="200" className={inputClass} value={taskBudget.maxRounds} onChange={e=>setTaskBudget(b=>({...b,maxRounds:Number(e.target.value)}))}/></label>
          <label className="block">已报告 Token 上限<input aria-label="任务已报告Token上限" type="number" min="1" max="20000000" className={inputClass} value={taskBudget.maxReportedTokens} onChange={e=>setTaskBudget(b=>({...b,maxReportedTokens:Number(e.target.value)}))}/></label>
          <p className="text-xs text-gray-400">含实验并行子任务。每次发送或继续生成使用一份新预算，执行中补充要求不重置；修改配置从下一次任务生效。Token 在服务返回用量后检查，可能超过阈值一个在途请求（并行时为多个），不是费用硬上限；未报告用量时依靠时间和轮数限制。到限会停止接收并保留草稿，不代表验收通过，服务端仍可能计费。</p>
        </fieldset>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={agentMode!=='pi'} checked={parallelDrafts} onChange={e=>setParallelDrafts(e.target.checked)}/><span>实验：独立组件并行建模<span className="block text-xs text-gray-400">最多两个子代理，仅接收组件任务；主代理合并后统一验收。总 Token 包含子代理，可能增加用量；简单任务仍串行。</span></span></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={agentMode==='pi'} checked={stream} onChange={e=>setStream(e.target.checked)}/><span>实时接收模型输出<span className="block text-xs text-gray-400">显示实际接收进度；服务不支持流式时可关闭，仍保留计时和超时保护</span></span></label>
</div></details>
        {result && <p role="status" data-testid="test-result" className={`text-sm rounded p-3 ${result.ok?'bg-emerald-950 text-emerald-200':'bg-red-950 text-red-200'}`}>{result.text}</p>}
      </div>
      <footer className="flex items-center justify-between p-4 border-t border-black/40">
        <button onClick={()=>void test()} disabled={!valid || testing || fetching} className="px-3 py-2 bg-white/10 rounded disabled:opacity-40">{testing?'测试中…':'测试连接'}</button>
        <div className="flex gap-2"><button onClick={onClose} className="px-3 py-2 bg-white/10 rounded">取消</button><button onClick={save} disabled={!valid || fetching} className="px-4 py-2 rounded bg-blue-600 disabled:opacity-40">保存配置</button></div>
      </footer>
    </Dialog.Content>
  </Dialog.Root>;
}
