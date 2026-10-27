// Shared release metadata. No secrets, filesystem access, or network calls.
const VERSION = /^v?(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?:-([0-9A-Za-z.-]{1,40}))?(?:\+[0-9A-Za-z.-]{1,40})?$/;
const PUB_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PLATFORM = /^(linux|darwin|windows)-(x86_64|aarch64|i686|armv7)$/;
const NOTES_MAX = 500;

export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = VERSION.exec(value.trim());
  if (!match) return null;
  const pre = match[4] ? match[4].split('.').filter(Boolean) : null;
  if (match[4] && (!pre.length || pre.some(part => !/^[0-9A-Za-z-]+$/.test(part)))) return null;
  return {version: `${match[1]}.${match[2]}.${match[3]}${pre ? `-${pre.join('.')}` : ''}`, core: [match[1], match[2], match[3]].map(Number), pre};
}

function compareIdentifiers(left, right) {
  const a = /^\d+$/.test(left), b = /^\d+$/.test(right);
  if (a && b) return Number(left) - Number(right);
  if (a) return -1;
  if (b) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  const length = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < length; i++) {
    if (a.pre[i] === undefined) return -1;
    if (b.pre[i] === undefined) return 1;
    const diff = compareIdentifiers(a.pre[i], b.pre[i]);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(remote, current) {
  return compareVersions(remote, current) === 1;
}

export function cleanNotes(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, NOTES_MAX);
}

export function versionBody(version, extra = {}) {
  const parsed = parseVersion(version);
  if (!parsed) return null;
  const body = {version: parsed.version};
  const notes = cleanNotes(extra.notes);
  if (notes) body.notes = notes;
  if (typeof extra.pubDate === 'string' && PUB_DATE.test(extra.pubDate)) body.pub_date = extra.pubDate;
  else if (typeof extra.pub_date === 'string' && PUB_DATE.test(extra.pub_date)) body.pub_date = extra.pub_date;
  return body;
}

export function versionResponse(body, method = 'GET') {
  const headers = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'};
  const payload = body ? body : {error: 'version unavailable'};
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), {status: body ? 200 : 404, headers});
}

export function versionFromAsset(asset) {
  if (!asset || asset.base64 || typeof asset.body !== 'string') return null;
  try {
    const parsed = JSON.parse(asset.body);
    return versionBody(parsed.version, parsed);
  } catch {
    return null;
  }
}

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return url;
}

function installerUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
  return url;
}

export function isInstallerUrl(value) {
  return installerUrl(value) !== null;
}

function mirrorKey(url) {
  return `${url.origin}${url.pathname}${url.search}`;
}

// `mirrors` is optional. A present but malformed list rejects the manifest so a bad publish fails closed.
// Duplicate entries and copies of `url` are dropped. Old clients ignore the field and keep using `url`.
function cleanMirrors(value, primary) {
  if (!Array.isArray(value) || value.length > 6) return null;
  const primaryUrl = installerUrl(primary);
  const primaryNorm = primaryUrl ? mirrorKey(primaryUrl) : '';
  const mirrors = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string') return null;
    const url = installerUrl(entry.trim());
    if (!url) return null;
    const key = mirrorKey(url);
    if (key === primaryNorm || seen.has(key)) continue;
    seen.add(key);
    mirrors.push(entry.trim());
  }
  return mirrors;
}

export function desktopManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = versionBody(value.version, value);
  const platforms = value.platforms;
  if (!version || !platforms || typeof platforms !== 'object' || Array.isArray(platforms)) return null;
  const keys = Object.keys(platforms);
  if (!keys.length || keys.length > 12) return null;
  const clean = {};
  for (const key of keys) {
    if (!PLATFORM.test(key)) return null;
    const item = platforms[key];
    if (!item || typeof item !== 'object' || !installerUrl(item.url) || typeof item.signature !== 'string') return null;
    if (item.signature.length < 40 || item.signature.length > 4000) return null;
    if (/^\s*(?:https?:|file:|[A-Za-z]:\\|\/|\.\.?\/)/.test(item.signature)) return null;
    const platform = {signature: item.signature, url: item.url};
    if (Object.prototype.hasOwnProperty.call(item, 'mirrors')) {
      const mirrors = cleanMirrors(item.mirrors, item.url);
      if (!mirrors) return null;
      if (mirrors.length) platform.mirrors = mirrors;
    }
    clean[key] = platform;
  }
  return {...version, platforms: clean};
}

const UPDATER_TOKEN = /^\{\{(target|arch|current_version|bundle_type)\}\}$/;

export function updaterEndpointError(value) {
  if (typeof value !== 'string' || !value || value.length > 500) return '更新检查地址无效';
  const url = httpsUrl(value);
  if (!url) return '更新检查地址必须是不含账号密码的 https 地址';
  if (url.search || url.hash) return '更新检查地址不能包含查询参数';
  const tokens = value.match(/\{\{[^}]+\}\}/g) ?? [];
  if (tokens.some(token => !UPDATER_TOKEN.test(token))) return '更新地址只允许 target、arch、current_version、bundle_type 占位符';
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~:{}-]*)*$/.test(value)) return '更新检查地址包含不支持的字符';
  return '';
}

export function updaterPubkeyError(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/=]{80,500}$/.test(value)) return '签名公钥必须是 tauri signer 打印的单行公钥';
  return '';
}

export function updaterDownloadOriginError(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return '安装包下载源无效';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 500) return '安装包下载源无效';
  if (trimmed.endsWith('/')) return '安装包下载源不能以斜杠结尾';
  let url;
  try { url = new URL(trimmed); } catch { return '安装包下载源无效'; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '安装包下载源必须是 http 或 https 地址';
  if (url.username || url.password) return '安装包下载源不能包含账号密码';
  if (url.search || url.hash) return '安装包下载源不能包含查询参数';
  if (url.pathname !== '/') return '安装包下载源只能包含协议、主机和端口';
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(trimmed)) return '安装包下载源包含不支持的字符';
  return '';
}
