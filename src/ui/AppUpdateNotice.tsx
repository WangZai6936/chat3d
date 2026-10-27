import {Button} from '@radix-ui/themes';
import {APP_VERSION, formatInstallingProgress, type UpdateView} from '../domain/appUpdate';
import {applyAppUpdate, appUpdateView, checkForAppUpdate, dismissUpdate, relaunchInstalledUpdate, remindUpdateAfterTask, useAppUpdate} from '../domain/appUpdateClient';
import './app-update.css';

export function AppUpdateProgressBar({label, percent, indeterminate}: {label: string; percent: number | null; indeterminate: boolean}) {
  const value = percent ?? undefined;
  const valueText = label;
  return <div className="app-update-progress">
    <div className="app-update-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={valueText} aria-label={label}>
      <div className="app-update-progress-fill" data-indeterminate={indeterminate || undefined} style={!indeterminate && percent != null ? {width: `${percent}%`} : undefined}/>
    </div>
    {percent != null && <span className="app-update-progress-percent" aria-hidden="true">{percent}%</span>}
  </div>;
}

export function AppUpdateBanner({view, onLater, onRemind, onApply, onBackup, onRestart}: {
  view: UpdateView;
  onLater: () => void;
  onRemind: () => void;
  onApply: () => void;
  onBackup: () => void;
  onRestart: () => void;
}) {
  const hidden = view.kind === 'hidden';
  const version = view.kind === 'hidden' ? '' : view.version;
  const notes = view.kind === 'busy' || view.kind === 'ready' ? view.notes : '';
  const dirty = view.kind === 'busy' || view.kind === 'ready' ? view.dirty : false;
  return <div className="app-update-notice" role="region" aria-label="应用更新" aria-live="polite" hidden={hidden}>
    {!hidden && <div className="app-update-copy">
      {view.kind === 'installing' && <><p><strong>{view.progress}</strong> 安装完成后，如果没有进行中的生成，应用会重启。</p><AppUpdateProgressBar label={view.progress} percent={view.percent} indeterminate={view.indeterminate}/></>}
      {view.kind === 'installed' && <p><strong>版本 {version} 已安装。</strong> {view.progress}</p>}
      {view.kind === 'failed' && <p><strong>更新到 {version} 未完成。</strong> {view.message}</p>}
      {view.kind === 'busy' && <p><strong>发现新版本 {version}。</strong> 当前还有生成或待确认的预览。请先结束这次任务并下载备份，更新不会打断它。</p>}
      {view.kind === 'ready' && <p><strong>{view.ended ? `任务已结束，可以更新到 ${version}。` : `发现新版本 ${version}。`}</strong> {dirty ? '当前修改尚未导出备份。请先下载项目备份，确认文件已保存在电脑上。' : '建议先下载项目备份，再更新。'} 模型密钥不会写入备份。</p>}
      {notes && <p>{notes}</p>}
    </div>}
    {!hidden && <div className="app-update-actions">
      {view.kind === 'busy' && <><Button variant="soft" color="gray" onClick={onLater}>稍后提醒</Button><Button variant="solid" onClick={onRemind}>结束后提醒我</Button></>}
      {view.kind === 'ready' && <><Button variant="soft" color="gray" onClick={onLater}>稍后</Button><Button variant="soft" color="gray" onClick={onBackup}>下载备份</Button><Button variant="solid" onClick={onApply}>立即更新</Button></>}
      {view.kind === 'failed' && <><Button variant="soft" color="gray" onClick={onLater}>稍后</Button><Button variant="solid" onClick={onApply}>重试</Button></>}
      {view.kind === 'installed' && <Button variant="solid" disabled={view.busy} onClick={onRestart}>立即重启</Button>}
    </div>}
  </div>;
}

export function AppUpdateNotice({onBackup}: {onBackup: () => void}) {
  const state = useAppUpdate();
  return <AppUpdateBanner view={appUpdateView(state)} onLater={dismissUpdate} onRemind={remindUpdateAfterTask} onApply={() => void applyAppUpdate()} onBackup={onBackup} onRestart={() => void relaunchInstalledUpdate()}/>;
}

export function AppUpdateSettings() {
  const checking = useAppUpdate(s => s.checking);
  const message = useAppUpdate(s => s.checkMessage);
  const phase = useAppUpdate(s => s.phase);
  const progress = useAppUpdate(s => s.progress);
  const progressMetrics = useAppUpdate(s => s.progressMetrics);
  const updating = phase === 'installing';
  const installDisplay = updating ? formatInstallingProgress(progressMetrics, progress || '正在下载更新…') : null;
  const buttonLabel = checking ? '正在检查…' : updating && installDisplay ? installDisplay.label : '检查应用更新';
  return <section className="settings-group"><header><h2>应用更新</h2><p>发现新版本后再决定何时更新</p></header><div className="settings-row"><div><h3>当前版本 {APP_VERSION}</h3><p>浏览器可以刷新到网站上的新版本。桌面版只安装已签名的发布包。生成进行中可以稍后更新。</p>{message && <p role="status">{message}</p>}{installDisplay && <AppUpdateProgressBar label={installDisplay.label} percent={installDisplay.percent} indeterminate={installDisplay.indeterminate}/>}</div><Button variant="soft" color="gray" disabled={checking || updating} onClick={() => void checkForAppUpdate({manual: true})}>{buttonLabel}</Button></div></section>;
}
