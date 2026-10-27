import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {desktopManifest, updaterDownloadOriginError, updaterEndpointError, versionBody} from '../shared/app-version.mjs';

export const PORTAL_UPDATER_ENDPOINT = 'https://portal.jiezi-ai.com/desktop-updates/chat3d/latest.json';
export const PORTAL_PUBLISH_DIR = '/opt/1panel/www/sites/portal.jiezi-ai.com/index/desktop-updates/chat3d';
export const PORTAL_ORIGIN_PORT = 38008;

const TRIPLES = {
  'x86_64-pc-windows-msvc': ['windows', 'x86_64'],
  'i686-pc-windows-msvc': ['windows', 'i686'],
  'aarch64-pc-windows-msvc': ['windows', 'aarch64'],
  'x86_64-apple-darwin': ['darwin', 'x86_64'],
  'aarch64-apple-darwin': ['darwin', 'aarch64'],
  'x86_64-unknown-linux-gnu': ['linux', 'x86_64'],
  'aarch64-unknown-linux-gnu': ['linux', 'aarch64'],
  'i686-unknown-linux-gnu': ['linux', 'i686'],
  'armv7-unknown-linux-gnueabihf': ['linux', 'armv7'],
};
const FOLDERS = {windows: 'windows', darwin: 'mac', linux: 'linux'};
const RESERVED_APP_NAMES = new Set(['windows', 'mac', 'linux', 'desktop-updates']);

export function archFromFilename(name) {
  const lower = name.toLowerCase();
  const token = pattern => new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?:[^a-z0-9]|$)`).test(lower);
  if (token('armv7|armhf')) return 'armv7';
  if (token('aarch64|arm64')) return 'aarch64';
  if (token('x86_64|amd64')) return 'x86_64';
  if (token('i686')) return 'i686';
  if (token('x64')) return 'x86_64';
  if (token('x86')) return 'i686';
  return null;
}

export function artifactKind(name) {
  if (name.endsWith('.nsis.zip') || name.endsWith('.msi.zip')) return {os: 'windows', generation: 'v1'};
  if (name.endsWith('.exe') || name.endsWith('.msi')) return {os: 'windows', generation: 'v2'};
  if (name.endsWith('.AppImage.tar.gz')) return {os: 'linux', generation: 'v1'};
  if (name.endsWith('.AppImage')) return {os: 'linux', generation: 'v2'};
  if (name.endsWith('.app.tar.gz')) return {os: 'darwin', generation: 'v2'};
  return null;
}

export function describeStaticEndpoint(endpoint) {
  const value = typeof endpoint === 'string' ? endpoint.trim() : '';
  const error = updaterEndpointError(value);
  if (error) return {ok: false, error};
  if (value.includes('{{')) return {ok: false, error: '静态 latest.json 地址不能包含 {{target}} 这类占位符'};
  const url = new URL(value);
  if (!url.pathname.endsWith('/latest.json')) return {ok: false, error: '静态清单地址必须以 /latest.json 结尾'};
  const segments = url.pathname.slice(0, -'/latest.json'.length).split('/').filter(Boolean);
  const appName = segments.at(-1) ?? '';
  if (segments.length < 2 || segments.at(-2) !== 'desktop-updates' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(appName)) {
    return {ok: false, error: '静态清单必须是 /desktop-updates/<应用名>/latest.json，例如 /desktop-updates/chat3d/latest.json'};
  }
  if (RESERVED_APP_NAMES.has(appName.toLowerCase())) return {ok: false, error: '应用目录不能是 windows、mac 或 linux。chat3d 使用 /desktop-updates/chat3d/latest.json'};
  return {ok: true, endpoint: value, appName};
}

export function artifactPublicUrl(endpoint, folder, filename, downloadOrigin = '') {
  const endpointUrl = new URL(endpoint);
  const directory = endpointUrl.pathname.slice(0, -'/latest.json'.length);
  const path = `${directory}/${folder}/${filename}`;
  const base = downloadOrigin.trim() ? new URL(downloadOrigin.trim()) : endpointUrl;
  base.pathname = path;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function readProjectVersion(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/\[package\][^\[]*version = "([^"]+)"/);
  if (!cargo) throw new Error('无法读取 src-tauri/Cargo.toml 版本');
  if (pkg !== tauri || pkg !== cargo[1]) throw new Error(`版本不一致：package.json=${pkg}，tauri.conf.json=${tauri}，Cargo.toml=${cargo[1]}`);
  return pkg;
}

function isInside(root, file) {
  const rel = relative(resolve(root), resolve(file));
  if (!rel || isAbsolute(rel)) return false;
  return !rel.split(/[\\/]/).includes('..');
}

function safeName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,180}$/.test(name) && !name.includes('..');
}

function tripleInPath(file) {
  for (const part of file.split(/[\\/]/)) if (TRIPLES[part]) return {triple: part, os: TRIPLES[part][0], arch: TRIPLES[part][1]};
  return null;
}

async function signatureFiles(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await signatureFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.sig')) files.push(full);
  }
  return files;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function collectUpdaterArtifacts(bundleDir, version) {
  const root = resolve(bundleDir);
  const info = await stat(root).catch(error => { if (error?.code === 'ENOENT') return null; throw error; });
  if (!info?.isDirectory()) throw new Error(`找不到构建目录 ${bundleDir}`);
  const found = [];
  for (const sigFile of await signatureFiles(root)) {
    const sigName = basename(sigFile);
    const filename = sigName.slice(0, -'.sig'.length);
    if (!safeName(filename) || !safeName(sigName)) throw new Error(`更新包文件名不安全：${filename}`);
    const file = join(dirname(sigFile), filename);
    if (!isInside(root, file) || !isInside(root, sigFile)) throw new Error('更新包路径超出构建目录');
    const artifact = await stat(file).catch(error => { if (error?.code === 'ENOENT') return null; throw error; });
    if (!artifact?.isFile() || artifact.size === 0) continue;
    const kind = artifactKind(filename);
    if (!kind) continue;
    const located = tripleInPath(file);
    if (located && located.os !== kind.os) throw new Error(`${filename} 的目标三元组与文件类型不一致`);
    const namedArch = archFromFilename(filename);
    if (located && namedArch && located.arch !== namedArch) throw new Error(`${filename} 的架构与目录 ${located.triple} 不一致`);
    const arch = namedArch ?? located?.arch ?? null;
    if (!arch) throw new Error(`${filename} 无法判断架构。请放在 target/<triple>/ 下，或在文件名中包含 x64、amd64、arm64`);
    const versions = filename.match(/\d+\.\d+\.\d+/g) ?? [];
    if (version && versions.some(foundVersion => foundVersion !== version)) throw new Error(`${filename} 的版本与当前版本 ${version} 不一致`);
    const raw = await readFile(sigFile);
    if (raw.length > 5000) throw new Error(`${sigName} 过长，不能当作 Tauri .sig`);
    const signature = raw.toString('utf8').replace(/\r\n/g, '\n').trim();
    found.push({platform: `${kind.os}-${arch}`, folder: FOLDERS[kind.os], filename, file, sigFile, signature, generation: kind.generation});
  }
  const byPlatform = new Map();
  for (const item of found) {
    const previous = byPlatform.get(item.platform);
    if (previous) throw new Error(`平台 ${item.platform} 有多份更新包：${previous.filename} 与 ${item.filename}。每个平台只能有一个 url`);
    byPlatform.set(item.platform, item);
  }
  if (!byPlatform.size) throw new Error('没有找到带 .sig 的 Tauri 更新包。createUpdaterArtifacts 为 true 时，Windows 是 NSIS 安装包 .exe 与 .exe.sig');
  return [...byPlatform.values()].sort((left, right) => left.platform.localeCompare(right.platform));
}

function secretValues(values) {
  return values.filter(value => typeof value === 'string' && value.trim().length > 8).map(value => value.trim());
}

function assertNoSecrets(text, secrets) {
  if (secrets.some(secret => text.includes(secret))) throw new Error('发布产物包含签名私钥或密码，已停止');
}

function uploadText({endpoint, appName, artifacts, hashes, downloadOrigin = ''}) {
  const lines = [
    '只上传应用目录。不要上传本文件、私钥或 src-tauri/updater.generated.json。',
    `应用目录：${appName}/`,
    `清单：${endpoint}`,
  ];
  const origin = downloadOrigin.trim();
  if (origin) {
    lines.push(`安装包下载源（latest.json 内 url 的 origin）：${origin}`);
    lines.push('检查更新仍使用上面的 https 清单；仅安装包直链可为 http。发布时设置 CHAT3D_UPDATER_DOWNLOAD_ORIGIN（无末尾斜杠）。');
  }
  if (endpoint === PORTAL_UPDATER_ENDPOINT) {
    lines.push(`服务器目录：${PORTAL_PUBLISH_DIR}/`);
    if (!origin) {
      lines.push(`源站监听 ${PORTAL_ORIGIN_PORT}，经 Cloudflare Tunnel 对外提供 https。未设置 CHAT3D_UPDATER_DOWNLOAD_ORIGIN 时，清单与安装包 url 同源。`);
    } else {
      lines.push(`源站监听 ${PORTAL_ORIGIN_PORT}。国内用户可从 ${origin} 直链下载安装包；清单仍走 Cloudflare https。`);
    }
    lines.push(`rsync -a --delete ${appName}/ <用户>@<服务器>:${PORTAL_PUBLISH_DIR}/`);
    lines.push(`上传后执行：curl -fsS ${endpoint}`);
  } else {
    lines.push('这个 endpoint 不是门户默认地址。请上传到实际托管该 latest.json 的目录。');
    lines.push(`chat3d 门户目录是 ${PORTAL_PUBLISH_DIR}/，清单是 ${PORTAL_UPDATER_ENDPOINT}`);
  }
  lines.push('latest.json 不要被 Cloudflare 长期缓存。安装包文件名包含版本，可以缓存。');
  lines.push('本次平台（没有产物的 mac、linux 不会出现，也不要手写空平台）：');
  for (const item of artifacts) lines.push(`- ${item.platform} -> ${item.folder}/${item.filename}`);
  lines.push('SHA256：');
  for (const item of hashes) lines.push(`${item.hash}  ${item.name}`);
  return `${lines.join('\n')}\n`;
}

export async function assembleDesktopUpdate({bundleDir, outDir, endpoint, version, notes = '', pubDate = '', privateKey = '', password = '', downloadOrigin = ''} = {}) {
  const described = describeStaticEndpoint(endpoint);
  if (!described.ok) throw new Error(described.error);
  const origin = typeof downloadOrigin === 'string' ? downloadOrigin.trim() : '';
  const originError = updaterDownloadOriginError(origin);
  if (originError) throw new Error(originError);
  const secrets = secretValues([privateKey, password]);
  const explicitDate = typeof pubDate === 'string' ? pubDate.trim() : '';
  const stamp = explicitDate || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const artifacts = await collectUpdaterArtifacts(bundleDir, version);
  const platforms = {};
  for (const item of artifacts) platforms[item.platform] = {signature: item.signature, url: artifactPublicUrl(described.endpoint, item.folder, item.filename, origin)};
  const body = versionBody(version, {notes, pubDate: stamp});
  if (!body) throw new Error('版本号无效');
  if (!body.pub_date) throw new Error('CHAT3D_UPDATE_PUB_DATE 必须是 RFC 3339 UTC，例如 2026-10-26T00:00:00Z');
  const manifest = desktopManifest({...body, platforms});
  if (!manifest) throw new Error('生成的 latest.json 未通过清单校验。signature 必须是 .sig 全文，url 必须是 http 或 https');
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  assertNoSecrets(serialized, secrets);
  const output = resolve(outDir);
  const appDir = join(output, described.appName);
  if (!isInside(output, appDir)) throw new Error('输出目录无效');
  const staging = join(output, `.${described.appName}.staging`);
  await rm(staging, {recursive: true, force: true});
  await mkdir(staging, {recursive: true});
  try {
    const hashes = [];
    for (const item of artifacts) {
      const destDir = join(staging, item.folder);
      await mkdir(destDir, {recursive: true});
      const destFile = join(destDir, item.filename);
      const destSig = join(destDir, `${item.filename}.sig`);
      await copyFile(item.file, destFile);
      await copyFile(item.sigFile, destSig);
      hashes.push({hash: await sha256(destFile), name: `${described.appName}/${item.folder}/${item.filename}`});
      hashes.push({hash: await sha256(destSig), name: `${described.appName}/${item.folder}/${item.filename}.sig`});
    }
    const manifestPath = join(staging, 'latest.json');
    await writeFile(manifestPath, serialized);
    hashes.unshift({hash: await sha256(manifestPath), name: `${described.appName}/latest.json`});
    const checked = desktopManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (!checked) throw new Error('写入后的 latest.json 校验失败');
    const note = uploadText({endpoint: described.endpoint, appName: described.appName, artifacts, hashes, downloadOrigin: origin});
    assertNoSecrets(note, secrets);
    await rm(appDir, {recursive: true, force: true});
    await rename(staging, appDir);
    const uploadPath = join(output, 'UPLOAD.txt');
    await writeFile(uploadPath, note);
    return {manifest: checked, appDir, manifestPath: join(appDir, 'latest.json'), uploadPath};
  } catch (error) {
    await rm(staging, {recursive: true, force: true});
    throw error;
  }
}
