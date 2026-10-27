import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assembleDesktopUpdate, readProjectVersion} from './desktop-update-publish.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} 需要参数`);
    process.exit(1);
  }
  return value;
}

export async function assembleFromEnvironment(env, args) {
  const endpoint = (env.CHAT3D_UPDATER_ENDPOINT ?? '').trim();
  if (!endpoint) throw new Error('请设置 CHAT3D_UPDATER_ENDPOINT=https://portal.jiezi-ai.com/desktop-updates/chat3d/latest.json');
  const root = resolve(args.root || process.cwd());
  const result = await assembleDesktopUpdate({
    bundleDir: resolve(root, args.bundle || 'src-tauri/target'),
    outDir: resolve(root, args.out || 'desktop-update-publish'),
    endpoint,
    downloadOrigin: (env.CHAT3D_UPDATER_DOWNLOAD_ORIGIN ?? '').trim(),
    version: readProjectVersion(root),
    notes: env.CHAT3D_UPDATE_NOTES ?? '',
    pubDate: (env.CHAT3D_UPDATE_PUB_DATE ?? '').trim(),
    privateKey: env.TAURI_SIGNING_PRIVATE_KEY ?? '',
    password: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
  });
  return result;
}

async function main() {
  const result = await assembleFromEnvironment(process.env, {root: option('--root'), bundle: option('--bundle'), out: option('--out')});
  console.log(`已生成 ${result.manifestPath}`);
  for (const [platform, item] of Object.entries(result.manifest.platforms)) console.log(`${platform} ${item.url}`);
  console.log(`上传说明：${result.uploadPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
