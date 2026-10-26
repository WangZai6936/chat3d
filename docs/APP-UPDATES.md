# 应用更新

浏览器和桌面版共用 `package.json`、`src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 里的版本号。发版时这三处必须一起递增，测试会核对它们相同。

更新不会读取或上传模型密钥。生成、截图、校验、应用或待确认预览进行中，页面不会自动刷新，桌面版也不会自动重启。

## 浏览器

生产构建把版本写入 `dist/version.json`。Node 与 Cloudflare Worker 都用它响应 `GET /api/version`，并设置 `Cache-Control: no-store`。反向代理要把 `/api/version` 转到 Node，不能落到静态首页。

已打开的页面约每 30 分钟、以及重新回到前台时检查一次。设置里的「检查应用更新」可以马上检查。发现更高版本后：

- 选择「稍后」，本次页面会话不再提示这一版本。
- 任务进行中选择「结束后提醒我」。任务结束后再提示，此时才可以刷新。
- 「下载备份」打开现有的备份与恢复。确认项目 JSON 已保存在电脑上之后，再选择「立即更新」。刷新只加载当前网站已经发布的前端。

可选的构建期环境变量（不要写入密钥）：

- `CHAT3D_UPDATE_NOTES`：最多 500 字的说明，写入 `version.json`
- `CHAT3D_UPDATE_PUB_DATE`：RFC 3339 UTC 时间，例如 `2026-10-26T00:00:00Z`

本地 `npm run dev` 用源码里的版本，避免旧的 `dist/version.json` 造成误报。

## 桌面

未配置更新源的安装包仍可运行。检查时会说明此包未启用自动更新，不会下载任何文件。

桌面构建需要 Rust 1.90 或更新版本。发布签名包时，在构建机器上设置这些环境变量。私钥不要进入仓库、镜像或 `VITE_*` 变量：

```sh
npm run tauri signer generate -- -w "$HOME/.chat3d/updater.key"
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.chat3d/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="签名密码"
export CHAT3D_UPDATER_PUBKEY="tauri signer 打印的单行公钥"
export CHAT3D_UPDATER_ENDPOINT="https://updates.example.com/chat3d/latest.json"
npm run tauri:build
```

`npm run tauri:build` 会先写入被 git 忽略的 `src-tauri/updater.generated.json`，其中只有公钥、https 端点和安装包签名开关。端点必须是 https，不能带账号、密码或查询参数。可以使用 `{{target}}`、`{{arch}}`、`{{current_version}}` 和 `{{bundle_type}}`。

构建产物旁会生成 `.sig` 签名。把安装包和签名放到你控制的 https 地址，并发布 Tauri 静态清单：

```json
{
  "version": "0.2.1",
  "notes": "修复预览保存",
  "pub_date": "2026-10-26T00:00:00Z",
  "platforms": {
    "linux-x86_64": {"signature": ".sig 文件的全文", "url": "https://updates.example.com/chat3d/Chat3D.AppImage"},
    "windows-x86_64": {"signature": ".sig 文件的全文", "url": "https://updates.example.com/chat3d/Chat3D-setup.exe"},
    "darwin-aarch64": {"signature": ".sig 文件的全文", "url": "https://updates.example.com/chat3d/Chat3D.app.tar.gz"}
  }
}
```

`signature` 是签名文件内容，不能写成路径或 URL。平台键只使用 `linux`、`darwin`、`windows` 加 `x86_64`、`aarch64`、`i686`、`armv7`。清单本身要放在 https 上。桌面端只安装签名校验通过的包。

也可以由 Node 从本机文件提供这份清单。设置 `CHAT3D_DESKTOP_UPDATE_MANIFEST=/var/lib/chat3d/latest.json` 后，`GET /api/desktop-update` 返回校验过的内容。这个路径只在服务端读取，不要把它指到私钥。Worker 部署没有本机清单文件，桌面端应直接使用对象存储或发布页上的 https 清单。

用户选择「立即更新」后，应用下载、校验并安装。若下载期间又开始了生成，安装完成后不会重启，需要等任务结束再点「立即重启」。

Windows 安装使用 NSIS 的 passive 模式。日常 `tauri build` 不生成更新签名；只有 `npm run tauri:build` 且两个公开更新变量都存在时才生成。

## 验证

自动测试：

```sh
node tests/app-update.mjs
```

浏览器手工检查：

1. `npm run build && npm start`，确认 `curl -sD- http://127.0.0.1:1420/api/version` 的版本与 `package.json` 相同，且包含 `cache-control: no-store`。
2. 把 `dist/version.json` 的版本临时改成 `99.0.0` 后刷新已打开的页面。应出现更新提示。
3. 开始一次生成，确认没有「立即更新」，可以选择「结束后提醒我」。
4. 结束生成后选择「稍后」，提示关闭；选择「立即更新」会刷新页面。
5. 把 `dist/version.json` 改回构建版本。

桌面手工检查需要两份已签名安装包和可访问的 https 清单。安装旧版本，发布更高版本的清单后打开应用或在设置中检查。任务进行中不应重启；空闲时「立即更新」应完成安装并重启。没有配置端点的调试包应继续启动，并在手动检查时说明未配置自动更新。
