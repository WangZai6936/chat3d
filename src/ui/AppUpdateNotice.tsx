import {useId} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {Button, Dialog} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {APP_VERSION, formatInstallingProgress, type UpdateView} from '../domain/appUpdate';
import {
  applyAppUpdate,
  appUpdateView,
  checkForAppUpdate,
  closeAppUpdatePanel,
  dismissUpdate,
  hasPendingAppUpdate,
  openAppUpdatePanel,
  relaunchInstalledUpdate,
  remindUpdateAfterTask,
  useAppUpdate,
} from '../domain/appUpdateClient';
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

function applyUpdateLabel(version: string) {
  return isTauri() ? `立即更新到 ${version}` : `刷新到 ${version}`;
}

export function AppUpdateBanner({view, onLater, onRemind, onApply, onBackup, onRestart}: {
  view: UpdateView;
  onLater: () => void;
  onRemind: () => void;
  onApply: () => void;
  onBackup: () => void;
  onRestart: () => void;
}) {
  const descriptionId = useId();
  const hidden = view.kind === 'hidden';
  const version = view.kind === 'hidden' ? '' : view.version;
  const notes = view.kind === 'busy' || view.kind === 'ready' ? view.notes : '';
  const dirty = view.kind === 'busy' || view.kind === 'ready' ? view.dirty : false;
  return <Dialog.Root open={!hidden} onOpenChange={open => { if (!open && view.kind !== 'installing') onLater(); }}>
    <Dialog.Content className="app-update-notice" maxWidth="560px" aria-label="应用更新" aria-describedby={descriptionId}
      onEscapeKeyDown={event => { if (view.kind === 'installing') event.preventDefault(); }}
      onInteractOutside={event => { if (view.kind === 'installing') event.preventDefault(); }}>
      <Dialog.Title>应用更新</Dialog.Title>
      <div id={descriptionId} className="app-update-copy" aria-live="polite">
        {(view.kind === 'ready' || view.kind === 'busy' || view.kind === 'failed') && <div className="app-update-version-highlight"><span>{view.kind === 'ready' && view.ended ? '任务已结束，可以更新到' : '发现新版本'}</span><strong>{version}</strong></div>}
        {view.kind === 'installing' && <><p><strong>{view.progress}</strong></p><AppUpdateProgressBar label={view.progress} percent={view.percent} indeterminate={view.indeterminate}/></>}
        {view.kind === 'installed' && <p><strong>版本 {version} 已安装。</strong> {view.progress}</p>}
        {view.kind === 'failed' && <p className="app-update-status-error" role="alert"><strong>更新未完成。</strong> {view.message}</p>}
        {(view.kind === 'busy' || view.kind === 'ready') && <div className="app-update-callout" data-warning={dirty || view.kind === 'busy' || undefined}>
          <p>{view.kind === 'busy' ? '当前还有生成或待确认的预览。请先结束这次任务并下载备份，更新不会打断它。' : dirty ? '当前修改尚未导出备份。请先下载项目备份，确认文件已保存在电脑上。' : '建议先下载项目备份，再更新。'}</p>
          <p className="app-update-backup-tip">模型密钥不会写入备份。</p>
        </div>}
        {notes && <div className="app-update-notes"><span className="app-update-notes-label">更新说明</span><p>{notes}</p></div>}
      </div>
      {!hidden && view.kind !== 'installing' && <div className="app-update-actions">
        {view.kind === 'busy' && <><Button variant="soft" color="gray" onClick={onLater}>稍后提醒</Button><Button variant="solid" onClick={onRemind}>结束后提醒我</Button></>}
        {view.kind === 'ready' && <><Button variant="soft" color="gray" onClick={onLater}>稍后</Button><Button variant="soft" color="gray" onClick={onBackup}>下载备份</Button><Button variant="solid" className="app-update-primary-action" onClick={onApply}>{applyUpdateLabel(version)}</Button></>}
        {view.kind === 'failed' && <><Button variant="soft" color="gray" onClick={onLater}>稍后</Button><Button variant="solid" className="app-update-primary-action" onClick={onApply}>重试更新</Button></>}
        {view.kind === 'installed' && <Button variant="solid" className="app-update-primary-action" disabled={view.busy} onClick={onRestart}>立即重启</Button>}
      </div>}
    </Dialog.Content>
  </Dialog.Root>;
}

export function AppUpdateNotice({onBackup}: {onBackup: () => void}) {
  const state = useAppUpdate();
  return <AppUpdateBanner view={appUpdateView(state)} onLater={dismissUpdate} onRemind={remindUpdateAfterTask} onApply={() => void applyAppUpdate()} onBackup={onBackup} onRestart={() => void relaunchInstalledUpdate()}/>;
}

export function AppUpdatePanel({layout = 'settings'}: {layout?: 'settings' | 'dialog'}) {
  const state = useAppUpdate();
  const view = appUpdateView(state);
  const release = state.release;
  const hasUpdate = hasPendingAppUpdate(state);
  const checking = state.checking;
  const message = state.checkMessage;
  const updating = state.phase === 'installing';
  const installDisplay = updating ? formatInstallingProgress(state.progressMetrics, state.progress || '正在下载更新…') : null;
  const desktop = isTauri();
  const version = release?.version ?? '';
  const showReadyActions = hasUpdate && !state.busy && state.phase === 'idle' && (view.kind === 'ready' || view.kind === 'hidden');
  const showBusyActions = hasUpdate && state.busy && state.phase === 'idle';
  const showFailed = view.kind === 'failed';
  const showInstalled = view.kind === 'installed';
  const showInstalling = view.kind === 'installing';

  return <div className={`app-update-panel ${layout === 'dialog' ? 'app-update-panel-dialog' : ''}`}>
    <div className="app-update-brand-card">
      <div className="app-update-brand"><strong>Scenivo</strong><p className="app-update-panel-lead">{desktop ? '桌面版只安装已签名的发布包。生成进行中可以稍后更新，不会打断当前任务。' : '网页版刷新即可使用站点上的最新功能。'}</p></div>
      <div className="app-update-version-compare" aria-label="版本信息">
        <div className="app-update-version-chip"><span className="app-update-version-label">当前版本</span><strong>{APP_VERSION}</strong></div>
        {hasUpdate && <span className="app-update-version-arrow" aria-hidden="true">→</span>}
        {hasUpdate && <div className="app-update-version-chip app-update-version-chip-new"><span className="app-update-version-label">可更新至</span><strong>{version}</strong></div>}
      </div>
    </div>
    {release?.notes && hasUpdate && <div className="app-update-notes"><span className="app-update-notes-label">更新说明</span><p>{release.notes}</p></div>}
    {message && <p className="app-update-status" role="status">{message}</p>}
    {showInstalling && <><p className="app-update-status"><strong>{view.progress}</strong></p><AppUpdateProgressBar label={view.progress} percent={view.percent} indeterminate={view.indeterminate}/></>}
    {showInstalled && <p className="app-update-status"><strong>版本 {version} 已安装。</strong> {view.progress}</p>}
    {showFailed && <p className="app-update-status app-update-status-error" role="alert"><strong>更新未完成。</strong> {view.message}</p>}
    {showBusyActions && <p className="app-update-status">当前还有生成或待确认的预览。可以先结束任务并备份，再回来更新。</p>}
    {showReadyActions && view.kind === 'ready' && view.dirty && <p className="app-update-status">当前修改尚未导出备份。建议先下载项目备份，再更新。</p>}
    {installDisplay && !showInstalling && <AppUpdateProgressBar label={installDisplay.label} percent={installDisplay.percent} indeterminate={installDisplay.indeterminate}/>}
    <div className="app-update-panel-actions">
      {showReadyActions && <>
        <Button size="3" variant="solid" className="app-update-primary-action" disabled={checking || updating} onClick={() => void applyAppUpdate()}>{applyUpdateLabel(version)}</Button>
        <Button size="2" variant="soft" color="gray" onClick={dismissUpdate}>稍后</Button>
      </>}
      {showBusyActions && <>
        <Button size="3" variant="solid" onClick={remindUpdateAfterTask}>结束后提醒我</Button>
        <Button size="2" variant="soft" color="gray" onClick={dismissUpdate}>稍后提醒</Button>
      </>}
      {showFailed && <Button size="3" variant="solid" className="app-update-primary-action" onClick={() => void applyAppUpdate()}>重试更新到 {version}</Button>}
      {showInstalled && <Button size="3" variant="solid" className="app-update-primary-action" disabled={view.busy} onClick={() => void relaunchInstalledUpdate()}>立即重启</Button>}
      {!hasUpdate && !showInstalling && !showInstalled && <Button size="3" variant="solid" className="app-update-primary-action" disabled={checking || updating} onClick={() => void checkForAppUpdate({manual: true})}>{checking ? '正在检查…' : '检查更新'}</Button>}
      {hasUpdate && !showReadyActions && !showBusyActions && !showFailed && !showInstalled && !showInstalling && <Button size="3" variant="solid" className="app-update-primary-action" disabled={checking || updating} onClick={() => void applyAppUpdate()}>{applyUpdateLabel(version)}</Button>}
    </div>
  </div>;
}

export function AppUpdateDialog() {
  const open = useAppUpdate(s => s.panelOpen);
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) closeAppUpdatePanel(); else openAppUpdatePanel(); }}>
    <Dialog.Content className="settings-module app-update-dialog" maxWidth="520px">
      <header className="app-update-dialog-header">
        <InfoCircledIcon aria-hidden="true"/>
        <div className="app-update-dialog-heading">
          <Dialog.Title>关于与更新</Dialog.Title>
          <Dialog.Description>查看当前版本、检查更新，并在新版本可用时一键安装。</Dialog.Description>
        </div>
      </header>
      <div className="app-update-dialog-body"><AppUpdatePanel layout="dialog"/></div>
      <div className="app-update-dialog-footer"><Button variant="soft" color="gray" onClick={closeAppUpdatePanel}>关闭</Button></div>
    </Dialog.Content>
  </Dialog.Root>;
}

export function AppUpdateNavEntry({disabled,layout='icon'}: {disabled?: boolean;layout?:'icon'|'sidebar'}) {
  const pending = useAppUpdate(s => hasPendingAppUpdate(s));
  return <Button variant="ghost" color="gray" className="app-update-nav-entry" title="关于 Scenivo 与检查更新" aria-label={pending ? '关于与更新，有新版本可用' : '关于与更新'} disabled={disabled} onClick={openAppUpdatePanel}>
    <InfoCircledIcon aria-hidden="true"/>
    {layout==='sidebar'?<span className="app-update-sidebar-label">Scenivo · v{APP_VERSION}</span>:<span className="app-update-nav-label">关于与更新</span>}
    {pending && <span className="app-update-nav-badge" aria-hidden="true">{layout==='sidebar'?'有更新':'新'}</span>}
  </Button>;
}

export function AppUpdateSettings() {
  return <section className="settings-group app-update-settings-group" id="app-update-section">
    <header><h2>关于与更新</h2><p>查看版本、检查更新，并在新版本可用时安装</p></header>
    <div className="settings-row app-update-settings-row"><AppUpdatePanel layout="settings"/></div>
  </section>;
}
