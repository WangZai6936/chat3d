import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {desktopManifest, updaterEndpointError} from '../shared/app-version.mjs';
import {assembleFromEnvironment} from '../scripts/assemble-desktop-update.mjs';
import {PORTAL_ORIGIN_PORT, PORTAL_PUBLISH_DIR, PORTAL_UPDATER_ENDPOINT, archFromFilename, artifactPublicUrl, assembleDesktopUpdate, describeStaticEndpoint, readProjectVersion} from '../scripts/desktop-update-publish.mjs';
import {parseMirrorOrigins} from '../shared/update-mirrors.mjs';
import {updaterReleaseMode} from '../scripts/updater-release-mode.mjs';

const signature = `untrusted comment: signature from tauri secret key\n${'R'.repeat(80)}`;
const pubkey = 'A'.repeat(80);
const privateKey = `untrusted comment: encrypted secret key\n${'P'.repeat(80)}`;
const password = 'desktop-update-password';
const endpoint = PORTAL_UPDATER_ENDPOINT;

assert.equal(updaterEndpointError(endpoint), '');
assert.equal(describeStaticEndpoint(endpoint).appName, 'chat3d');
assert.equal(describeStaticEndpoint('https://portal.jiezi-ai.com/desktop-updates/latest.json').ok, false);
assert.equal(describeStaticEndpoint('https://portal.jiezi-ai.com/desktop-updates/windows/latest.json').ok, false);
assert.equal(describeStaticEndpoint('https://portal.jiezi-ai.com/desktop-updates/chat3d/latest.json?cache=1').ok, false);
assert.equal(describeStaticEndpoint('https://portal.jiezi-ai.com/desktop-updates/chat3d/{{target}}/latest.json').ok, false);
assert.equal(describeStaticEndpoint('https://updates.example.com/desktop-updates/otherapp/latest.json').appName, 'otherapp');
assert.equal(artifactPublicUrl(endpoint, 'windows', 'Scenivo_0.2.0_x64-setup.exe'), `https://portal.jiezi-ai.com/desktop-updates/chat3d/windows/Scenivo_0.2.0_x64-setup.exe`);
assert.equal(artifactPublicUrl(endpoint, 'windows', 'Scenivo_0.2.0_x64-setup.exe', 'http://36.133.218.210:38008'), `http://36.133.218.210:38008/desktop-updates/chat3d/windows/Scenivo_0.2.0_x64-setup.exe`);
assert.equal(archFromFilename('Scenivo_0.2.0_x64-setup.exe'), 'x86_64');
assert.equal(archFromFilename('Scenivo_0.2.0_amd64.AppImage'), 'x86_64');
assert.equal(archFromFilename('Scenivo_0.2.0_x86_64.AppImage'), 'x86_64');
assert.equal(readProjectVersion(process.cwd()), JSON.parse(readFileSync('package.json', 'utf8')).version);

function assertScoped(text, label) {
  const recommended = text.split('\n').filter(line => !line.includes('不要')).join('\n');
  for (const item of ['/desktop-updates/latest.json', 'desktop-updates/windows/', 'desktop-updates/mac/', 'desktop-updates/linux/', 'updates.example.com']) {
    assert.equal(recommended.includes(item), false, `${label} still recommends ${item}`);
  }
  assert.ok(text.includes(PORTAL_UPDATER_ENDPOINT), label);
  assert.ok(text.includes(PORTAL_PUBLISH_DIR), label);
}
const doc = readFileSync('docs/APP-UPDATES.md', 'utf8');
const example = readFileSync('.env.example', 'utf8');
const workflow = readFileSync('.github/workflows/windows-desktop.yml', 'utf8');
assertScoped(doc, 'APP-UPDATES.md');
assertScoped(example, '.env.example');
assertScoped(workflow, 'windows-desktop.yml');
assert.ok(doc.includes('desktop-updates/chat3d/windows/'));
assert.ok(doc.includes('desktop-updates/chat3d/mac/'));
assert.ok(doc.includes('desktop-updates/chat3d/linux/'));
assert.ok(doc.includes(String(PORTAL_ORIGIN_PORT)));
assert.match(workflow, /npm run tauri -- build/);
assert.match(workflow, /npm run tauri:build:windows/);
assert.match(workflow, /desktop-update:assemble/);
assert.match(workflow, /CHAT3D_UPDATER_DOWNLOAD_ORIGIN/);
assert.match(workflow, /CHAT3D_UPDATER_DOWNLOAD_MIRRORS/);
assert.equal(parseMirrorOrigins('').ok, true);
assert.equal(parseMirrorOrigins('http://36.133.218.210:38008/').ok, false);
assert.equal(workflow.includes(privateKey), false);
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
assert.match(scripts['tauri:build:windows'], /prepare-updater-config/);
assert.match(scripts['tauri:build:windows'], /tauri\.windows\.conf\.json/);
assert.match(scripts['desktop-update:assemble'], /assemble-desktop-update/);
assert.match(scripts.test, /desktop-update-publish\.mjs/);

assert.equal(updaterReleaseMode({}).mode, 'unsigned');
assert.deepEqual(updaterReleaseMode({CHAT3D_UPDATER_ENDPOINT: endpoint}).missing, ['TAURI_SIGNING_PRIVATE_KEY', 'CHAT3D_UPDATER_PUBKEY']);
assert.equal(updaterReleaseMode({TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password}).mode, 'invalid');
const signed = updaterReleaseMode({TAURI_SIGNING_PRIVATE_KEY: privateKey, CHAT3D_UPDATER_PUBKEY: pubkey, CHAT3D_UPDATER_ENDPOINT: endpoint});
assert.equal(signed.mode, 'signed');
assert.equal(updaterReleaseMode({TAURI_SIGNING_PRIVATE_KEY: privateKey, CHAT3D_UPDATER_PUBKEY: pubkey, CHAT3D_UPDATER_ENDPOINT: endpoint, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''}).mode, 'signed');
assert.equal(updaterReleaseMode({TAURI_SIGNING_PRIVATE_KEY: privateKey, CHAT3D_UPDATER_PUBKEY: 'short', CHAT3D_UPDATER_ENDPOINT: endpoint}).mode, 'invalid');

const root = await mkdtemp(join(tmpdir(), 'chat3d-desktop-update-'));
try {
  const bundle = join(root, 'bundle');
  const windows = join(bundle, 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis');
  const mac = join(bundle, 'aarch64-apple-darwin', 'release', 'bundle', 'macos');
  const linux = join(bundle, 'appimage');
  await mkdir(windows, {recursive: true});
  await mkdir(mac, {recursive: true});
  await mkdir(linux, {recursive: true});
  const exe = 'Scenivo_0.2.0_x64-setup.exe';
  const macArchive = 'Scenivo.app.tar.gz';
  const image = 'Scenivo_0.2.0_amd64.AppImage';
  await writeFile(join(windows, exe), 'windows-installer');
  await writeFile(join(windows, `${exe}.sig`), signature);
  await writeFile(join(mac, macArchive), 'mac-archive');
  await writeFile(join(mac, `${macArchive}.sig`), signature.replaceAll('R', 'M'));
  await writeFile(join(linux, image), 'linux-image');
  await writeFile(join(linux, `${image}.sig`), signature.replaceAll('R', 'L'));
  const out = join(root, 'publish');
  const result = await assembleDesktopUpdate({bundleDir: bundle, outDir: out, endpoint, version: '0.2.0', notes: '  修复预览  ', pubDate: '2026-10-26T00:00:00Z', privateKey, password});
  const manifest = desktopManifest(JSON.parse(await readFile(result.manifestPath, 'utf8')));
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.notes, '修复预览');
  assert.equal(manifest.pub_date, '2026-10-26T00:00:00Z');
  assert.equal(manifest.platforms['windows-x86_64'].url, `https://portal.jiezi-ai.com/desktop-updates/chat3d/windows/${exe}`);
  assert.deepEqual(manifest.platforms['windows-x86_64'].mirrors, [`http://36.133.218.210:38008/desktop-updates/chat3d/windows/${exe}`]);
  assert.equal(manifest.platforms['darwin-aarch64'].url, `https://portal.jiezi-ai.com/desktop-updates/chat3d/mac/${macArchive}`);
  assert.deepEqual(manifest.platforms['darwin-aarch64'].mirrors, [`http://36.133.218.210:38008/desktop-updates/chat3d/mac/${macArchive}`]);
  assert.equal(manifest.platforms['linux-x86_64'].url, `https://portal.jiezi-ai.com/desktop-updates/chat3d/linux/${image}`);
  assert.deepEqual(manifest.platforms['linux-x86_64'].mirrors, [`http://36.133.218.210:38008/desktop-updates/chat3d/linux/${image}`]);
  assert.equal(manifest.platforms['windows-x86_64'].signature, signature);
  assert.equal(await readFile(join(out, 'chat3d', 'windows', exe), 'utf8'), 'windows-installer');
  assert.equal(await readFile(join(out, 'chat3d', 'windows', `${exe}.sig`), 'utf8'), signature);
  const upload = await readFile(result.uploadPath, 'utf8');
  assert.ok(upload.includes(PORTAL_PUBLISH_DIR));
  assert.equal(upload.includes('desktop-updates/windows/'), false);
  const published = JSON.stringify(manifest) + upload + await readFile(join(out, 'chat3d', 'windows', `${exe}.sig`), 'utf8');
  assert.equal(published.includes(privateKey), false);
  assert.equal(published.includes(password), false);
  assert.equal(published.includes(pubkey), false);
  await assert.rejects(() => assembleDesktopUpdate({bundleDir: bundle, outDir: out, endpoint, version: '0.2.0', pubDate: 'tomorrow'}), /RFC 3339/);
  await writeFile(join(windows, 'Scenivo_0.1.0_x64-setup.exe'), 'old');
  await writeFile(join(windows, 'Scenivo_0.1.0_x64-setup.exe.sig'), signature);
  await assert.rejects(() => assembleDesktopUpdate({bundleDir: bundle, outDir: out, endpoint, version: '0.2.0', pubDate: '2026-10-26T00:00:00Z'}), /0\.1\.0/);
  await rm(join(windows, 'Scenivo_0.1.0_x64-setup.exe'));
  await rm(join(windows, 'Scenivo_0.1.0_x64-setup.exe.sig'));
  await writeFile(join(windows, 'Scenivo_0.2.0_x64-setup.nsis.zip'), 'zip');
  await writeFile(join(windows, 'Scenivo_0.2.0_x64-setup.nsis.zip.sig'), signature);
  await assert.rejects(() => assembleDesktopUpdate({bundleDir: bundle, outDir: out, endpoint, version: '0.2.0', pubDate: '2026-10-26T00:00:00Z'}), /多份更新包/);

  const windowsOnly = join(root, 'windows-only');
  await mkdir(join(windowsOnly, 'nsis'), {recursive: true});
  await writeFile(join(windowsOnly, 'nsis', exe), 'only-windows');
  await writeFile(join(windowsOnly, 'nsis', `${exe}.sig`), signature);
  const httpOut = join(root, 'http-publish');
  const httpResult = await assembleDesktopUpdate({
    bundleDir: windowsOnly,
    outDir: httpOut,
    endpoint,
    version: '0.2.0',
    pubDate: '2026-10-26T00:00:00Z',
    downloadOrigin: 'http://36.133.218.210:38008',
  });
  const httpManifest = JSON.parse(await readFile(httpResult.manifestPath, 'utf8'));
  assert.equal(httpManifest.platforms['windows-x86_64'].url, `http://36.133.218.210:38008/desktop-updates/chat3d/windows/${exe}`);
  assert.deepEqual(httpManifest.platforms['windows-x86_64'].mirrors, [`https://portal.jiezi-ai.com/desktop-updates/chat3d/windows/${exe}`]);
  const httpUpload = await readFile(httpResult.uploadPath, 'utf8');
  assert.ok(httpUpload.includes('CHAT3D_UPDATER_DOWNLOAD_ORIGIN'));
  assert.ok(httpUpload.includes('http://36.133.218.210:38008'));
  assert.ok(httpUpload.includes('镜像'));

  const onlyOut = join(root, 'only-publish');
  await assembleDesktopUpdate({bundleDir: windowsOnly, outDir: onlyOut, endpoint: 'https://portal.jiezi-ai.com/desktop-updates/otherapp/latest.json', version: '0.2.0', pubDate: '2026-10-26T00:00:00Z'});
  const onlyManifest = JSON.parse(await readFile(join(onlyOut, 'otherapp', 'latest.json'), 'utf8'));
  assert.deepEqual(Object.keys(onlyManifest.platforms), ['windows-x86_64']);
  assert.equal(onlyManifest.platforms['windows-x86_64'].url, `https://portal.jiezi-ai.com/desktop-updates/otherapp/windows/${exe}`);
  assert.deepEqual(onlyManifest.platforms['windows-x86_64'].mirrors, [`http://36.133.218.210:38008/desktop-updates/otherapp/windows/${exe}`]);
  const foreignOut = join(root, 'foreign-publish');
  const foreign = await assembleDesktopUpdate({bundleDir: windowsOnly, outDir: foreignOut, endpoint: 'https://updates.example.com/desktop-updates/otherapp/latest.json', version: '0.2.0', pubDate: '2026-10-26T00:00:00Z'});
  assert.equal(foreign.manifest.platforms['windows-x86_64'].mirrors, undefined);
  const cdn = await assembleDesktopUpdate({bundleDir: windowsOnly, outDir: join(root, 'cdn-publish'), endpoint: 'https://updates.example.com/desktop-updates/otherapp/latest.json', version: '0.2.0', pubDate: '2026-10-26T00:00:00Z', downloadOrigin: 'https://downloads.example.com', mirrorOrigins: ['https://backup.example.com']});
  assert.equal(cdn.manifest.platforms['windows-x86_64'].url, `https://downloads.example.com/desktop-updates/otherapp/windows/${exe}`);
  assert.deepEqual(cdn.manifest.platforms['windows-x86_64'].mirrors, [`https://updates.example.com/desktop-updates/otherapp/windows/${exe}`, `https://backup.example.com/desktop-updates/otherapp/windows/${exe}`]);
  await assert.rejects(readFile(join(onlyOut, 'otherapp', 'mac', '.keep')), /ENOENT/);
  await assert.rejects(readFile(join(onlyOut, 'windows', exe)), /ENOENT/);
  await assert.rejects(readFile(join(onlyOut, 'latest.json')), /ENOENT/);

  const cliBundle = join(root, 'cli-bundle');
  const cliNsis = join(cliBundle, 'nsis');
  await mkdir(cliNsis, {recursive: true});
  const cliExe = `Scenivo_${readProjectVersion(process.cwd())}_x64-setup.exe`;
  await writeFile(join(cliNsis, cliExe), 'cli-windows');
  await writeFile(join(cliNsis, `${cliExe}.sig`), signature);
  const cli = await assembleFromEnvironment({
    CHAT3D_UPDATER_ENDPOINT: endpoint,
    CHAT3D_UPDATER_DOWNLOAD_ORIGIN: 'http://36.133.218.210:38008',
    CHAT3D_UPDATE_PUB_DATE: '2026-10-26T00:00:00Z',
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
  }, {root: process.cwd(), bundle: cliBundle, out: join(root, 'cli-publish')});
  assert.equal(cli.manifest.version, readProjectVersion(process.cwd()));
  assert.equal(cli.manifest.platforms['windows-x86_64'].url, `http://36.133.218.210:38008/desktop-updates/chat3d/windows/${cliExe}`);
  assert.deepEqual(cli.manifest.platforms['windows-x86_64'].mirrors, [`https://portal.jiezi-ai.com/desktop-updates/chat3d/windows/${cliExe}`]);
  assert.equal((await readFile(cli.manifestPath, 'utf8')).includes(privateKey), false);
  await assert.rejects(() => assembleFromEnvironment({
    CHAT3D_UPDATER_ENDPOINT: endpoint,
    CHAT3D_UPDATER_DOWNLOAD_MIRRORS: 'http://36.133.218.210:38008/',
    CHAT3D_UPDATE_PUB_DATE: '2026-10-26T00:00:00Z',
  }, {root: process.cwd(), bundle: cliBundle, out: join(root, 'bad-mirrors')}), /镜像源/);
} finally { await rm(root, {recursive: true, force: true}); }

const outputFile = join(tmpdir(), `chat3d-updater-mode-${process.pid}.txt`);
const clean = {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP};
const unsigned = spawnSync(process.execPath, ['scripts/updater-release-mode.mjs'], {cwd: process.cwd(), env: {...clean, GITHUB_OUTPUT: outputFile}, encoding: 'utf8'});
assert.equal(unsigned.status, 0, unsigned.stderr);
assert.match(readFileSync(outputFile, 'utf8'), /^mode=unsigned\n/);
const partial = spawnSync(process.execPath, ['scripts/updater-release-mode.mjs'], {cwd: process.cwd(), env: {...clean, CHAT3D_UPDATER_ENDPOINT: endpoint}, encoding: 'utf8'});
assert.equal(partial.status, 1);
assert.match(partial.stderr, /TAURI_SIGNING_PRIVATE_KEY/);
assert.equal(partial.stderr.includes(privateKey), false);
const missingEndpoint = spawnSync(process.execPath, ['scripts/assemble-desktop-update.mjs'], {cwd: process.cwd(), env: clean, encoding: 'utf8'});
assert.equal(missingEndpoint.status, 1);
assert.match(missingEndpoint.stderr, /CHAT3D_UPDATER_ENDPOINT/);
console.log('PASS desktop update manifest, portal paths and signing mode');
