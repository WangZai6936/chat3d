import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildUpdaterConfig} from './updater-config.mjs';

const result = buildUpdaterConfig(process.env);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
const output = resolve('src-tauri/updater.generated.json');
writeFileSync(output, JSON.stringify(result.config, null, 2) + '\n');
console.log(result.enabled ? '已写入桌面更新配置（不含私钥）' : '未配置桌面更新源，已写入空的更新配置');
