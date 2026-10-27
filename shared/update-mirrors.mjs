// Candidate installer URLs for one signed desktop package.
// The bytes are verified by the Tauri updater after download; only the transport URL may change.
import {isInstallerUrl, updaterDownloadOriginError} from './app-version.mjs';

export const PORTAL_PUBLIC_ORIGIN = 'https://portal.jiezi-ai.com';
export const PORTAL_DIRECT_ORIGIN = 'http://36.133.218.210:38008';
export const KNOWN_DOWNLOAD_ORIGINS = [PORTAL_PUBLIC_ORIGIN, PORTAL_DIRECT_ORIGIN];
export const MAX_DOWNLOAD_CANDIDATES = 8;
export const MIN_INSTALLER_BYTES = 1024 * 1024;
export const MIN_PROBE_BYTES = 1024;
export const DOWNLOAD_PROBE_BYTES = 16 * 1024;
export const DOWNLOAD_PROBE_TIMEOUT_MS = 3500;

function installerKey(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}${url.search}`;
}

function pushUnique(list, seen, value) {
  if (typeof value !== 'string' || !isInstallerUrl(value.trim())) return;
  const trimmed = value.trim();
  const key = installerKey(trimmed);
  if (seen.has(key) || list.length >= MAX_DOWNLOAD_CANDIDATES) return;
  seen.add(key);
  list.push(trimmed);
}

export function replaceDownloadOrigin(urlString, origin) {
  const url = new URL(urlString);
  const base = new URL(origin);
  if (base.username || base.password || base.search || base.hash || (base.pathname !== '/' && base.pathname !== '')) {
    throw new Error('镜像源只能包含协议、主机和端口');
  }
  url.protocol = base.protocol;
  url.hostname = base.hostname;
  url.port = base.port;
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.toString();
}

export function parseMirrorOrigins(value) {
  if (value == null || value === '') return {ok: true, origins: []};
  if (typeof value !== 'string') return {ok: false, error: '安装包镜像源无效'};
  const origins = value.split(',').map(item => item.trim()).filter(Boolean);
  if (origins.length > 6) return {ok: false, error: '安装包镜像源最多 6 个'};
  for (const origin of origins) {
    const error = updaterDownloadOriginError(origin);
    if (error) return {ok: false, error: `安装包镜像源无效：${error}`};
  }
  return {ok: true, origins};
}

function knownOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return KNOWN_DOWNLOAD_ORIGINS.some(item => new URL(item).origin === origin);
  } catch {
    return false;
  }
}

// Mirrors written into latest.json. `url` stays the primary so older clients are unchanged.
export function mirrorListForPublishedUrl({endpoint, primary, extraOrigins = []} = {}) {
  const primaryUrl = new URL(primary);
  const endpointOrigin = new URL(endpoint).origin;
  const seeds = [replaceDownloadOrigin(primary, endpointOrigin)];
  if (primaryUrl.pathname.includes('/desktop-updates/') && (knownOrigin(endpointOrigin) || knownOrigin(primaryUrl.origin))) {
    for (const origin of KNOWN_DOWNLOAD_ORIGINS) seeds.push(replaceDownloadOrigin(primary, origin));
  }
  for (const origin of extraOrigins) seeds.push(replaceDownloadOrigin(primary, origin));
  const mirrors = [];
  const seen = new Set([installerKey(primary)]);
  for (const seed of seeds) pushUnique(mirrors, seen, seed);
  return mirrors;
}

export function sameDownloadUrl(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !isInstallerUrl(left) || !isInstallerUrl(right)) return false;
  return installerKey(left.trim()) === installerKey(right.trim());
}

export function platformMirrorList(raw, primary) {
  const platforms = raw && typeof raw === 'object' ? raw.platforms : null;
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) return [];
  const mirrors = [];
  for (const item of Object.values(platforms)) {
    if (!item || typeof item !== 'object' || !sameDownloadUrl(item.url, primary)) continue;
    if (Array.isArray(item.mirrors)) mirrors.push(...item.mirrors);
  }
  return mirrors;
}

// Primary first, then manifest mirrors, then the known portal/origin pair when the path matches.
export function candidateDownloadUrls(primary, mirrors = []) {
  const list = [];
  const seen = new Set();
  pushUnique(list, seen, primary);
  if (Array.isArray(mirrors)) {
    for (const mirror of mirrors) pushUnique(list, seen, mirror);
  }
  const base = list[0];
  if (base) {
    try {
      const current = new URL(base);
      if (current.pathname.includes('/desktop-updates/') && knownOrigin(current.origin)) {
        for (const origin of KNOWN_DOWNLOAD_ORIGINS) pushUnique(list, seen, replaceDownloadOrigin(base, origin));
      }
    } catch { /* primary was already validated */ }
  }
  return list;
}

export function installerTotalBytes(status, headers) {
  const read = name => {
    if (!headers) return '';
    const value = typeof headers.get === 'function' ? headers.get(name) : headers[name];
    return typeof value === 'string' ? value : '';
  };
  if (status === 206) {
    const match = /\/(\d+)\s*$/.exec(read('content-range'));
    return match ? Number(match[1]) : null;
  }
  const length = read('content-length').trim();
  return /^\d+$/.test(length) ? Number(length) : null;
}

function nonBinaryContentType(value) {
  if (!value) return false;
  const type = value.split(';')[0].trim().toLowerCase();
  return type.startsWith('text/') || type === 'application/json' || type === 'application/problem+json' || type.endsWith('+json') || type === 'application/xml' || type.endsWith('+xml');
}

// A short sample is only a ranking signal. Error pages and tiny responses do not win.
export function scoreDownloadProbe(sample) {
  if (!sample || (sample.status !== 200 && sample.status !== 206)) return null;
  if (nonBinaryContentType(sample.contentType)) return null;
  const bytes = sample.bytes;
  const elapsedMs = sample.elapsedMs;
  if (!(bytes > 0) || !(elapsedMs > 0)) return null;
  const total = sample.totalBytes;
  if (typeof total === 'number' && total < MIN_INSTALLER_BYTES) return null;
  const sized = typeof total === 'number' && total >= MIN_INSTALLER_BYTES;
  if (bytes < MIN_PROBE_BYTES && !sized) return null;
  return {bytesPerMs: bytes / elapsedMs};
}

function withTimeout(work, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(work).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    }),
  ]);
}

// Parallel short probes. The first candidate is the fallback when every probe fails.
export async function selectFastestDownloadUrl(candidates, probe, options = {}) {
  const list = [];
  const seen = new Set();
  for (const candidate of candidates ?? []) pushUnique(list, seen, candidate);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_PROBE_TIMEOUT_MS;
  const ranked = await Promise.all(list.map(async (url, index) => {
    try {
      const sample = await withTimeout(probe(url, timeoutMs), timeoutMs + 250);
      const score = scoreDownloadProbe(sample);
      return score ? {url, index, bytesPerMs: score.bytesPerMs} : null;
    } catch {
      return null;
    }
  }));
  const good = ranked.filter(Boolean).sort((left, right) => right.bytesPerMs - left.bytesPerMs || left.index - right.index);
  return good[0]?.url ?? list[0];
}
