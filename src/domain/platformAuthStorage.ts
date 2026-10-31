export const PLATFORM_AUTH_KEY = 'chat3d.platform.auth';
export const DEFAULT_PLATFORM_BASE = 'http://36.133.218.210:48080';
export const DEFAULT_PLATFORM_TENANT = '1';

export interface PlatformAuth {
  base: string;
  tenantId: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresTime: number;
  remember: boolean;
}

let storageError: string | null = null;
export const platformAuthStorageError = () => storageError;

function stored(auth: PlatformAuth) {
  return {base: auth.base, tenantId: auth.tenantId, username: auth.username, remember: true, accessToken: auth.accessToken, refreshToken: auth.refreshToken, expiresTime: auth.expiresTime};
}

/** Persist the platform session only after explicit consent. Never log tokens. */
export function savePlatformAuth(auth: PlatformAuth | null): void {
  storageError = null;
  try {
    if (!auth || auth.remember !== true) { localStorage.removeItem(PLATFORM_AUTH_KEY); return; }
    localStorage.setItem(PLATFORM_AUTH_KEY, JSON.stringify(stored(auth)));
  } catch {
    let removed = false;
    try { localStorage.removeItem(PLATFORM_AUTH_KEY); removed = true; } catch { /* report below */ }
    storageError = removed
      ? '协同登录仅在本次会话生效，本机保存失败；旧的协同凭据已移除。'
      : '无法更新本机协同登录。旧令牌可能仍在浏览器存储中，请允许存储访问后重试或清除本站数据。';
  }
}

export function loadPlatformAuth(): PlatformAuth | null {
  storageError = null;
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PLATFORM_AUTH_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<PlatformAuth>;
    if (!c || c.remember !== true || typeof c.accessToken !== 'string' || !c.accessToken || typeof c.base !== 'string' || typeof c.tenantId !== 'string') {
      savePlatformAuth(null);
      return null;
    }
    return {base: c.base, tenantId: c.tenantId, username: typeof c.username === 'string' ? c.username : '', accessToken: c.accessToken, refreshToken: typeof c.refreshToken === 'string' ? c.refreshToken : '', expiresTime: typeof c.expiresTime === 'number' ? c.expiresTime : 0, remember: true};
  } catch { return null; }
}
