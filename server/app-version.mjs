import {readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {desktopManifest, versionBody, versionResponse} from '../shared/app-version.mjs';

const MANIFEST_BYTES = 64 * 1024;

export async function readPublishedVersion(root = process.cwd(), {preferPackage = false} = {}) {
  const dist = resolve(root, 'dist/version.json');
  if (!preferPackage) {
    try {
      const parsed = JSON.parse(await readFile(dist, 'utf8'));
      return versionBody(parsed.version, parsed);
    } catch (error) {
      if (error?.code !== 'ENOENT') return null;
    }
  }
  try {
    const parsed = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    return versionBody(parsed.version, {});
  } catch {
    return null;
  }
}

export async function readDesktopManifest(file) {
  if (typeof file !== 'string' || !file.trim()) return null;
  try {
    const target = resolve(file);
    const info = await stat(target);
    if (!info.isFile() || info.size > MANIFEST_BYTES) return null;
    return desktopManifest(JSON.parse(await readFile(target, 'utf8')));
  } catch {
    return null;
  }
}

function send(res, response, method) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (method === 'HEAD') { res.end(); return Promise.resolve(); }
  return response.arrayBuffer().then(body => { res.end(Buffer.from(body)); });
}

export function appVersionMiddleware({root = process.cwd(), preferPackage = false, env = process.env} = {}) {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/api/version' && path !== '/api/desktop-update') { next(); return; }
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return; }
    const ready = path === '/api/version'
      ? readPublishedVersion(root, {preferPackage})
      : readDesktopManifest(env.CHAT3D_DESKTOP_UPDATE_MANIFEST);
    ready.then(body => send(res, versionResponse(body, req.method), req.method)).catch(() => {
      if (!res.headersSent) return send(res, versionResponse(null, req.method), req.method);
    });
  };
}

export function appVersionPlugin() {
  return {
    name: 'chat3d-app-version',
    configureServer(server) { server.middlewares.use(appVersionMiddleware({preferPackage: true})); },
    configurePreviewServer(server) { server.middlewares.use(appVersionMiddleware({preferPackage: false})); },
  };
}
