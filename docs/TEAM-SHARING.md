# 公司内部团队共享（0.2.0）

沿用 React/Vite/Tauri 与 Node 服务。首版是**一个公司、一个团队**：所有有效成员可查看、搜索、预览并复制已发布资产和场景；个人 IndexedDB、草稿、对话、模型 API 设置仍保留本地，没有后台同步或迁移上传。团队账户与模型 API 账户无关。

## 部署

需要 Node.js 24、一个持久化本地磁盘目录，以及由公司指定的 HTTPS 反向代理。SQLite 是 Node 内置模块，无新增数据库服务或 npm 依赖。不支持将数据库放在临时容器层、网络共享磁盘或多个副本中运行。Sites/静态托管/现有 Worker 不提供团队数据库；桌面安装包也不内嵌数据库服务器。

在选定服务器检出提交后：

```sh
npm ci
npm run build
export CHAT3D_TEAM_DB=/srv/chat3d-data/team.sqlite
# 浏览器实际来源必须精确匹配；不要设置通配符。
export CHAT3D_TEAM_ORIGINS=https://team.company.example,https://portal.jiezi-ai.com,http://tauri.localhost,tauri://localhost
export HOST=127.0.0.1
export PORT=1420
npm start
```

Dockerfile 同时包含团队校验器。容器部署时将受限持久卷挂载至 `/data`，显式设置 `CHAT3D_TEAM_DB=/data/team.sqlite` 和来源白名单；目录须可由容器的 node 用户写入。不要将生产数据库放入构建上下文。

首次运行前由服务器管理员创建持久目录并限制服务用户访问。反向代理将指定 HTTPS 域名转发到 127.0.0.1:1420，允许至少 22 MB 请求体，设置至少 60 秒请求超时。公司域名、证书、服务器位置和运行账号须由部署方提供；仓库不含生产凭据。不要向公网开放无 TLS 的 Node 端口。已有模型代理配置保持独立，不必启用任何收费模型即可使用共享功能。

网页本机测试可以使用 `http://127.0.0.1:1420`，并将浏览器开发来源（例如 `http://localhost:1421`、`http://127.0.0.1:1420`）加入 `CHAT3D_TEAM_ORIGINS`。桌面客户端保留既有 Tauri 权限，仅支持标准 HTTPS 443（本机测试 HTTP 80）；不要填写 1420、1435 等自定义端口。公司部署应使用 HTTPS 443 反向代理到 Node 端口，不要扩大客户端通配权限。Vite dev 不自动承载团队服务；浏览器与桌面客户端填写另行启动的 Node 服务根地址。未设置 `CHAT3D_TEAM_DB` 时共享 API 不启用。

### 浏览器团队库（轻量 Web）

构建产物 `dist-team-web/` 由 `npm run build:team-web` 生成，并随 `npm run build` 一并产出。启用团队数据库的 Node 服务会在 `/team/` 提供独立 SPA（与桌面 `dist/` 主应用分离）：

- 地址示例：`https://portal.jiezi-ai.com/team/`（同域调用 `/api/team/`，无需在网页里填写端口）。
- 能力：登录、搜索、预览固定版本、**下载桌面导入包**（资产 JSON / 场景 `.chat3d.json`，含新 id，不写入浏览器 IndexedDB）。
- 不在 Web 端提供 AI 生成、工作台编辑或选择性发布；发布仍在桌面客户端顶部导航 **团队** 页完成。

**OpenResty / Nginx 要点（与现有门户并存）：**

```nginx
# 团队 API（已有）
location ^~ /api/team/ {
  proxy_pass http://127.0.0.1:1420;
  client_max_body_size 22m;
  proxy_read_timeout 60s;
}

# 浏览器团队库 SPA（Node 1420 已内置静态路由；反代整站或仅 /team/ 均可）
location ^~ /team/ {
  proxy_pass http://127.0.0.1:1420;
  proxy_read_timeout 60s;
}

# 桌面更新（勿改动路径）
location ^~ /desktop-updates/chat3d/ {
  # 继续由门户静态目录或现有规则提供
}
```

将 **`https://portal.jiezi-ai.com`**（以及实际提供 `/team/` 的精确来源，无尾部斜杠）加入 `CHAT3D_TEAM_ORIGINS`。门户根路径可继续只放桌面更新说明页；团队浏览入口使用 `/team/` 子路径即可。

## 账号管理

没有开放注册或默认密码。管理员通过服务器命令创建账户，密码从标准输入读取（不少于12字符，最多256字符），不要放在命令行参数、仓库或日志中。以下交互提示中的密码由管理员自行选择：

```sh
read -rs -p 'New account password: ' TEAM_PASSWORD; printf '\n'
printf '%s' "$TEAM_PASSWORD" | node server/team/admin.mjs add alice member
unset TEAM_PASSWORD
# add 名称 admin|member|viewer；禁用账号立即撤销全部会话：
node server/team/admin.mjs disable alice
```

角色：`viewer` 只能读取；`member` 可发布新原件和追加自己的原件版本；`admin` 可追加任意原件版本。现有版本不可编辑或删除。账号生命周期管理使用此受服务器操作系统权限控制的命令，不向客户端提供提升权限入口。首版不提供密码重置/重新启用命令；禁用旧账号后可创建新名称。数据库只保存 scrypt 密码哈希和会话 token 哈希。会话8小时过期；客户端 token 仅在内存中，关闭库页面/应用后需重新登录。仅服务根地址保存在 localStorage。客户端不跟随 API 重定向。Windows/Tauri 使用项目已有原生 HTTP 插件，沿用既有权限范围与正常 TLS 校验；网页使用浏览器请求和来源白名单。

## 使用

1. 点击顶部导航 **团队**，在团队资产 / 团队场景之间切换；首次填写 HTTPS 服务根地址（公司门户可填 `https://portal.jiezi-ai.com`，不要带 `/team` 或 `/api`）并登录。
2. “选择性发布”中选择一个本地资产或场景；资产需先保存到本地资产库，场景可以显式选择草稿。选择“新团队原件”或有权更新的原件。
3. 点击“准备发布”冻结快照，再确认发布。确认前取消不发上传请求。提交中按钮锁定；网络失败后“重试同一次发布”复用同一幂等键，不产生重复版本。
4. 请求结果不确定时取消仅停止重试，不能撤回可能已完成的发布；刷新团队库核对。页面关闭会丢弃待重试请求，因此重开后先检查团队库再重新发布。
5. 成员搜索并预览固定版本，点击“复制到本地”（桌面）或“下载桌面导入包”（浏览器 `/team/`）：资产生成新 id、版本 1；场景生成新项目 id。桌面复制直接进入本地库；浏览器下载后可在桌面「模型资产库」或工作台「打开项目」导入。每次复制创建独立副本。
6. 更新原件使用乐观版本检查；其他人已更新时会拒绝旧版本写入，刷新后重新准备。历史发布版本可通过 `/api/team/items/{id}/{version}` 读取，界面列表展示最新版本（最多500项搜索结果）。

场景发布的是完整几何和材质快照（包括动画），已有 `modelAsset` id/version 引用不随团队资产更新。场景展示和编辑无需联网解析最新资产，不会被新版破坏。资产的质量验收记录不会当作团队认证迁移。共享过程不改变原有 IndexedDB schema 或备份导入导出格式。

预览使用项目现有缩略图渲染器，不请求生成模型。发布数据不包括工作区对话、模型密钥或生成历史；模型名称、说明和几何本身仍是用户主动共享的内容。

## 运维与边界

- 备份：停止服务后复制整个持久目录（含 SQLite、WAL、SHM）；恢复到受限目录，保持相同 Node 版本后启动。在线备份须使用 SQLite 的备份工具，不要仅复制正在写入的主文件。备份含密码哈希与有效会话，应按内部敏感数据保管。
- 限制：单进程服务，单团队，没有实时协作、外部客户租户、SSO、发布撤回或在线用户管理。单次发布22 MB HTTP上限，现有格式校验20 MB上限。容量规划与磁盘配额由部署方管理。
- 防护：服务端认证、数据库事务、不可变版本、逐原件写权限、跨源白名单；登录错误累计8次暂时限流15分钟。生产代理还应限制连接与登录速率。TLS在公司反向代理终止。
- 测试仅创建临时账号与临时数据库，不触及真实个人数据、不调用真实收费模型。

## 验证与 Windows 交付

```sh
npm test             # 原有完整回归
npm run test:team    # SQLite/HTTP、桌面团队页、Web 导入包与 /team 静态路由测试
npm run build        # TypeScript、前端、Worker、团队校验器构建
```

`.github/workflows/windows-desktop.yml` 在 main 推送后先运行上述回归，再打包 **0.2.1** Windows x64 NSIS，并调用安装测试。每次制品都记录本次提交 SHA、工作流 ID、版本和 SHA256；安装测试校验这些字段与安装后的 ProductVersion，再执行现有可访问性/UI 操作。安装包与 `windows-installed-smoke-{sha}` 包含原始证据。该流程不代表用户 GPU 或公司实际 HTTPS 部署已经验证，也不能用旧0.1.3结果替代。本次 CI 结果与链接见交付记录。
