import {isTauri} from '@tauri-apps/api/core';
import {create} from 'zustand';
import {APP_VERSION, classifyUpdaterError, deriveUpdateView, publicUpdateError, reduceUpdateProgress, type ReleaseNotice, type UpdateProgressEvent, type UpdateProgressState, type UpdateView} from './appUpdate';
import {cleanNotes, isNewerVersion, parseVersion} from '../../shared/app-version.mjs';

const DISMISS_KEY = 'chat3d.update.dismissed';
const REMIND_KEY = 'chat3d.update.remind';
const CHECK_INTERVAL = 30 * 60 * 1000;

interface AppUpdateState {
  busy: boolean;
  dirty: boolean;
  release: ReleaseNotice | null;
  dismissed: string | null;
  remind: string | null;
  phase: 'idle' | 'installing' | 'installed' | 'failed';
  progress: string;
  error: string;
  checking: boolean;
  checkMessage: string;
}

const stored = (key: string) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};
const remember = (key: string, value: string | null) => {
  try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* 隐私模式仍可完成本次选择 */ }
};

export const useAppUpdate = create<AppUpdateState>(() => ({
  busy: false, dirty: false, release: null, dismissed: stored(DISMISS_KEY), remind: stored(REMIND_KEY),
  phase: 'idle', progress: '', error: '', checking: false, checkMessage: '',
}));

export function setAppUpdateContext(input: {busy: boolean; dirty: boolean}) {
  useAppUpdate.setState(input);
}

export function appUpdateView(state: AppUpdateState = useAppUpdate.getState()): UpdateView {
  return deriveUpdateView({...state, current: APP_VERSION});
}

export function dismissUpdate() {
  const version = useAppUpdate.getState().release?.version;
  if (!version) return;
  remember(DISMISS_KEY, version); remember(REMIND_KEY, null);
  useAppUpdate.setState({dismissed: version, remind: null, phase: 'idle', error: ''});
}

export function remindUpdateAfterTask() {
  const version = useAppUpdate.getState().release?.version;
  if (!version) return;
  remember(DISMISS_KEY, version); remember(REMIND_KEY, version);
  useAppUpdate.setState({dismissed: version, remind: version, phase: 'idle', error: ''});
}

async function fetchWebRelease(): Promise<ReleaseNotice | null> {
  const response = await fetch('/api/version', {cache: 'no-store', headers: {accept: 'application/json'}});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('更新检查失败');
  const data = await response.json() as {version?: unknown; notes?: unknown};
  const parsed = parseVersion(typeof data?.version === 'string' ? data.version : '');
  if (!parsed) throw new Error('更新信息无效');
  return {version: parsed.version, notes: cleanNotes(typeof data.notes === 'string' ? data.notes : '')};
}

async function fetchDesktopRelease(): Promise<ReleaseNotice | null> {
  const {check} = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {version: update.version, notes: cleanNotes(update.body ?? '')};
}

let inflight = false;
let lastCheck = 0;
let lastFailure = 0;
let checksStarted = false;
const FAILURE_BACKOFF = 5 * 60 * 1000;

export async function checkForAppUpdate(options?: {manual?: boolean}) {
  const manual = options?.manual ?? false;
  const state = useAppUpdate.getState();
  if (state.phase === 'installing' || inflight) return;
  const now = Date.now();
  if (!manual && ((lastCheck && now - lastCheck < CHECK_INTERVAL) || (lastFailure && now - lastFailure < FAILURE_BACKOFF))) return;
  inflight = true;
  if (manual) useAppUpdate.setState({checking: true, checkMessage: '正在检查更新…'});
  try {
    let release: ReleaseNotice | null = null;
    let unconfigured = false;
    if (isTauri()) {
      try { release = await fetchDesktopRelease(); }
      catch (error) {
        if (classifyUpdaterError(error) === 'unconfigured') unconfigured = true;
        else throw error;
      }
    } else release = await fetchWebRelease();
    const newer = release && isNewerVersion(release.version, APP_VERSION) ? release : null;
    const current = useAppUpdate.getState();
    useAppUpdate.setState({
      release: newer,
      checking: false,
      phase: current.phase === 'failed' || current.phase === 'idle' ? 'idle' : current.phase,
      error: '',
      checkMessage: manual
        ? unconfigured
          ? '此安装包未配置自动更新。请从受信任的发布渠道获取新版本，不要运行来历不明的安装包。'
          : newer ? `发现新版本 ${newer.version}` : `已是当前版本 ${APP_VERSION}`
        : current.checkMessage,
    });
    lastCheck = Date.now();
    lastFailure = 0;
  } catch (error) {
    lastFailure = Date.now();
    if (manual) useAppUpdate.setState({checking: false, checkMessage: classifyUpdaterError(error) === 'unconfigured' ? '此安装包未配置自动更新。请从受信任的发布渠道获取新版本，不要运行来历不明的安装包。' : '暂时无法检查更新。请确认网络后再试。'});
  } finally {
    inflight = false;
    if (manual) useAppUpdate.setState({checking: false});
  }
}

async function installDesktopUpdate(onProgress: (label: string) => void) {
  const {check} = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update || !isNewerVersion(update.version, APP_VERSION)) throw new Error('没有可安装的新版本');
  let progress: UpdateProgressState = {loaded: 0, total: null, label: '正在下载更新…'};
  await update.downloadAndInstall(event => {
    progress = reduceUpdateProgress(progress, event as UpdateProgressEvent);
    onProgress(progress.label);
  });
}

export async function relaunchInstalledUpdate() {
  if (useAppUpdate.getState().busy) return;
  const {relaunch} = await import('@tauri-apps/plugin-process');
  await relaunch();
}

export async function applyAppUpdate() {
  const state = useAppUpdate.getState();
  if (state.busy || state.phase === 'installing' || !state.release) return;
  if (!isTauri()) { window.location.reload(); return; }
  useAppUpdate.setState({phase: 'installing', progress: '正在下载更新…', error: ''});
  try {
    await installDesktopUpdate(progress => useAppUpdate.setState({progress}));
    if (useAppUpdate.getState().busy) {
      useAppUpdate.setState({phase: 'installed', progress: '更新已安装。请先结束当前任务，并确认项目备份已保存在电脑上，再重启应用。'});
      return;
    }
    useAppUpdate.setState({phase: 'installed', progress: '正在重启以完成更新…'});
    await relaunchInstalledUpdate();
  } catch (error) {
    useAppUpdate.setState({phase: 'failed', error: publicUpdateError(error), progress: ''});
  }
}

export function startAppUpdateChecks() {
  if (checksStarted || typeof window === 'undefined') return;
  checksStarted = true;
  window.setTimeout(() => void checkForAppUpdate(), 4000);
  window.setInterval(() => void checkForAppUpdate(), CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForAppUpdate();
  });
}
