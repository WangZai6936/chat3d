# Model network transport

The web application never directly fetches a model provider. `getFetch()` routes `/models` and `/chat/completions` (including connection tests and Pi SSE) to `/api/model/...` on the page's own origin. The original API root is a request header, not a URL containing a key. The server forwards only the caller's Bearer token, content type and Accept header to an explicitly approved API root. Desktop Tauri builds continue to use their native HTTP plugin and fail clearly if it is unavailable instead of silently falling back to browser fetch.

## Development and local preview

- `npm ci`, then `npm run dev` (default localhost:1420)
- `npm run build`, then `npm run preview` also installs the same proxy middleware
- Restart the development server after pulling this change; hot reload alone cannot install new server middleware
- The reported provider `https://discovery-api.intern-ai.org.cn/v1` and `https://api.openai.com/v1` work with the built-in allowlist. Users enter their own keys in model settings. No project developer key is included
- Other trusted public HTTPS providers: set comma-separated API roots in `CHAT3D_ALLOWED_UPSTREAMS` in `.env.local` or the server's environment. This replaces the defaults. Configure once per deployment, not per client computer. Do not put secrets in `VITE_*` settings

## Production Node / Docker

`npm run build && npm start` serves the app and API proxy together. Node 24 is recommended. The default listen address is 127.0.0.1:1420. Set HOST=0.0.0.0 only when deploying behind your own access controls. Docker builds run as the node user and listen on port1420.

Behind an HTTPS reverse proxy set `CHAT3D_PUBLIC_ORIGIN` to the exact external page origin (scheme, hostname, port, no trailing slash). Preserve Host and route `/api/model/*` to this Node service. Disable response buffering and permit sufficiently long streamed responses; do not put API requests behind a static SPA fallback. API credentials are supplied by each caller and are neither persisted nor logged by this proxy.

## Hosted Worker

The build also emits a self-contained Cloudflare-compatible `dist/server/index.js`, serving client assets and the same proxy. Runtime `CHAT3D_ALLOWED_UPSTREAMS` optionally replaces its built-in allowlist. The owner-private Sites manifest selects the Worker rather than static-only hosting. It does not require a shared provider key or database. Embedded assets are generated build output, never hand-maintained source.

## Deployment boundaries

Uploading only `dist/index.html` and assets to a static-only server is insufficient: it has no network forwarding process. Deploy the supplied Node server/Worker, or provide an equivalent same-origin reverse proxy. The UI detects missing proxy responses and reports this rather than silently reverting to CORS-prone direct access. Installing this change does not remove the need to authenticate with the provider or make an unreachable/blocked provider accessible. Provider network, account, quota and geographical rules still apply. A native installer must be rebuilt to include frontend changes; no native binary is shipped by the web deployment.

## Safety and operation

- Exact server-side HTTPS API-root allowlist; no wildcard or arbitrary target proxy
- Only GET models and POST chat completions. No administrative endpoints, arbitrary paths, URL credentials, query forwarding or redirects
- Caller Origin must match the application origin when present; cross-site browser requests rejected. No permissive CORS headers and no browser security disablement
- Request body capped at8 MiB; 3-minute idle timeout resets on stream data; cancellation propagates upstream
- Upstream status preserved, cookies removed, no API response caching, no key/body logging
- This is not a shared-key authentication service. Public hosting still needs application-level user access control and normal provider rate limits. Never configure untrusted/rebinding domains or infrastructure/metadata addresses as upstreams

Verification: automated shared-handler, actual loopback Node HTTP, browser transport and built Worker checks use dummy keys and mocked upstream responses. Live provider success still depends on the user's valid credentials and deployment network; no real paid model calls are made by these checks.
