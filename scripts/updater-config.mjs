import {updaterEndpointError, updaterPubkeyError} from '../shared/app-version.mjs';

export function buildUpdaterConfig(env) {
  const endpoint = (env.CHAT3D_UPDATER_ENDPOINT ?? '').trim();
  const pubkey = (env.CHAT3D_UPDATER_PUBKEY ?? '').trim();
  if (!endpoint && !pubkey) return {ok: true, enabled: false, config: {}};
  if (!endpoint || !pubkey) return {ok: false, error: '自动更新需要同时设置 CHAT3D_UPDATER_ENDPOINT 与 CHAT3D_UPDATER_PUBKEY'};
  const endpointError = updaterEndpointError(endpoint);
  if (endpointError) return {ok: false, error: endpointError};
  const pubkeyError = updaterPubkeyError(pubkey);
  if (pubkeyError) return {ok: false, error: pubkeyError};
  return {
    ok: true,
    enabled: true,
    config: {
      bundle: {createUpdaterArtifacts: true},
      plugins: {
        updater: {
          pubkey,
          endpoints: [endpoint],
          // 清单仍走 https；安装包 url 可为 http（见 CHAT3D_UPDATER_DOWNLOAD_ORIGIN）。发布构建需显式允许非 TLS 下载。
          dangerousInsecureTransportProtocol: true,
          windows: {installMode: 'passive'},
        },
      },
    },
  };
}
