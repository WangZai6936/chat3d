import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {updaterPubkeyError} from '../shared/app-version.mjs';
import {describeStaticEndpoint} from './desktop-update-publish.mjs';

export function updaterReleaseMode(env) {
  const key = (env.TAURI_SIGNING_PRIVATE_KEY ?? '').trim();
  const pubkey = (env.CHAT3D_UPDATER_PUBKEY ?? '').trim();
  const endpoint = (env.CHAT3D_UPDATER_ENDPOINT ?? '').trim();
  const password = env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '';
  const required = [
    ['TAURI_SIGNING_PRIVATE_KEY', Boolean(key)],
    ['CHAT3D_UPDATER_PUBKEY', Boolean(pubkey)],
    ['CHAT3D_UPDATER_ENDPOINT', Boolean(endpoint)],
  ];
  const missing = required.filter(([, present]) => !present).map(([name]) => name);
  if (!required.some(([, present]) => present) && !String(password).trim()) return {mode: 'unsigned', missing: [], errors: []};
  if (missing.length) return {mode: 'invalid', missing, errors: []};
  const described = describeStaticEndpoint(endpoint);
  const errors = [described.ok ? '' : described.error, updaterPubkeyError(pubkey)].filter(Boolean);
  if (errors.length) return {mode: 'invalid', missing: [], errors};
  return {mode: 'signed', missing: [], errors: []};
}

function main() {
  const result = updaterReleaseMode(process.env);
  if (result.mode === 'invalid') {
    const why = result.missing.length ? `缺少 ${result.missing.join('、')}` : result.errors.join('；');
    console.error(`签名发布配置不完整（${why}）。已中止，避免把未签名包当成可自动更新的发布。私钥不会打印。`);
    process.exit(1);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${result.mode}\n`);
  if (result.mode === 'signed') {
    console.log('签名密钥和更新地址已齐全，将构建带自动更新的 Windows 包并生成 latest.json');
    console.log(`更新清单地址：${(process.env.CHAT3D_UPDATER_ENDPOINT ?? '').trim()}`);
  } else console.log('未配置桌面更新签名，继续构建未签名 NSIS 安装包');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
