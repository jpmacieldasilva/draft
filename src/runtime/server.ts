import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore, confined, publicPath, record, RequestError } from './workspace.js';

export const viewerDirectory = fileURLToPath(new URL('../viewer/', import.meta.url));
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
function send(response: ServerResponse, status: number, body: unknown) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); }
async function body(request: IncomingMessage): Promise<Record<string, unknown>> { let text = ''; for await (const chunk of request) { text += String(chunk); if (Buffer.byteLength(text) > 65536) throw new RequestError('Requisição muito grande.', 413); } let value: unknown; try { value = JSON.parse(text || '{}'); } catch { throw new RequestError('JSON inválido.'); } if (!record(value)) throw new RequestError('JSON inválido.'); return value; }
async function listen(server: Server, port: number) { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta indisponível.'); return `http://127.0.0.1:${address.port}`; }
export function injectBridge(html: string, bridgeUrl: string) { return html.replace(/<head([^>]*)>/i, `<head$1><script src="${bridgeUrl}"></script>`) === html ? `<script src="${bridgeUrl}"></script>${html}` : html.replace(/<head([^>]*)>/i, `<head$1><script src="${bridgeUrl}"></script>`); }
export async function startRuntime(folder: string, port = 4173) {
  const store = new WorkspaceStore(folder); await store.initialize(); let viewerOrigin = ''; let contentOrigin = ''; const clients = new Set<ServerResponse>();
  function broadcast(event: unknown) { for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`); }
  const content = createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(contentOrigin).host) throw new RequestError('Host inválido.', 403);
      if (!['GET', 'HEAD'].includes(request.method || '')) throw new RequestError('Método inválido.', 405);
      const relative = decodeURIComponent(new URL(request.url || '/', contentOrigin).pathname).slice(1);
      const filename = relative === 'bridge.js' ? path.join(viewerDirectory, 'bridge.js') : await confined(store.root, relative);
      if (relative !== 'bridge.js' && (!publicPath(relative) || !publicPath(path.relative(store.root, filename)))) throw new RequestError('Arquivo privado.', 403);
      if (!(await stat(filename)).isFile()) throw new RequestError('Arquivo não encontrado.', 404);
      const html = path.extname(filename) === '.html'; const source = await readFile(filename);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; script-src 'unsafe-inline' ${contentOrigin}; style-src 'unsafe-inline' ${contentOrigin}; img-src data: blob: ${contentOrigin}; font-src data: ${contentOrigin}; media-src ${contentOrigin}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${viewerOrigin}` });
      response.end(request.method === 'HEAD' ? undefined : html ? injectBridge(source.toString(), '/bridge.js') : source);
    } catch (error) { send(response, error instanceof RequestError ? error.status : 404, { error: error instanceof Error ? error.message : 'Arquivo indisponível.' }); }
  });
  contentOrigin = await listen(content, 0); store.contentOrigin = contentOrigin;
  const viewer = createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(viewerOrigin).host) throw new RequestError('Host inválido.', 403);
      const pathname = new URL(request.url || '/', viewerOrigin).pathname;
      if (pathname.startsWith('/api/')) {
        if (request.headers.origin && request.headers.origin !== viewerOrigin) throw new RequestError('Origem inválida.', 403);
        if (request.method === 'GET' && pathname === '/api/workspace') return send(response, 200, await store.snapshot());
        if (request.method === 'GET' && pathname === '/api/presence') return send(response, 200, await store.loadPresence());
        if (request.method === 'GET' && pathname === '/api/events') { response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); response.write(': connected\n\n'); clients.add(response); request.on('close', () => clients.delete(response)); return; }
        if (!['POST', 'DELETE'].includes(request.method || '')) throw new RequestError('Rota não encontrada.', 404);
        const token = request.headers['x-draft-token'] ?? request.headers['x-draftroom-token'];
        if (token !== store.token || (request.headers.origin && request.headers.origin !== viewerOrigin)) throw new RequestError('Escrita não autorizada.', 403);
        if (pathname === '/api/presence') {
          if (request.method === 'POST') {
            const payload = await body(request);
            const actorHeader = (request.headers['x-actor-id'] ?? request.headers['x-draft-actor-id'] ?? request.headers['actor-id']) as string | undefined;
            const actorId = actorHeader || (typeof payload.id === 'string' ? payload.id : undefined);
            const frameId = payload.frameId !== undefined ? (payload.frameId === null ? null : String(payload.frameId)) : undefined;
            const label = typeof payload.label === 'string' ? payload.label : undefined;
            const ttlSeconds = typeof payload.ttlSeconds === 'number' ? payload.ttlSeconds : undefined;
            const claimResult = await store.claim({ id: actorId, frameId, label, ttlSeconds });
            broadcast({ type: 'presence', actors: claimResult.state.actors });
            return send(response, 200, { ...claimResult.actor, actor: claimResult.actor, actors: claimResult.state.actors });
          }
          if (request.method === 'DELETE') {
            const payload: Record<string, unknown> = await body(request).catch(() => ({}));
            const parsedUrl = new URL(request.url || '/', viewerOrigin);
            const queryId = parsedUrl.searchParams.get('id');
            const actorHeader = (request.headers['x-actor-id'] ?? request.headers['x-draft-actor-id'] ?? request.headers['actor-id']) as string | undefined;
            const id = (typeof payload.id === 'string' ? payload.id : (queryId || actorHeader)) || undefined;
            const state = await store.clearPresence(id ? { id } : undefined);
            broadcast({ type: 'presence', actors: state.actors });
            return send(response, 200, { cleared: true, actors: state.actors });
          }
        }
        if (request.method !== 'POST') throw new RequestError('Rota não encontrada.', 404);
        const payload = await body(request); let workspace;
        if (pathname === '/api/layout') workspace = await store.saveLayout(payload);
        else if (pathname === '/api/edits') workspace = await store.saveEdit(payload);
        else if (pathname === '/api/feedback') workspace = await store.feedback(payload);
        else if (/^\/api\/feedback\/[^/]+$/.test(pathname)) workspace = await store.feedback(payload, pathname.split('/')[3]);
        else if (pathname === '/api/frames') workspace = await store.createFrame(typeof payload.title === 'string' ? payload.title : '');
        else { const match = pathname.match(/^\/api\/frames\/([^/]+)\/(rename|duplicate)$/); if (!match) throw new RequestError('Rota não encontrada.', 404); workspace = await store.changeFrame(decodeURIComponent(match[1]), match[2], payload); }
        send(response, 200, workspace); return;
      }
      if (!['GET', 'HEAD'].includes(request.method || '')) throw new RequestError('Método inválido.', 405);
      const relative = pathname === '/' || !path.extname(pathname) ? 'index.html' : decodeURIComponent(pathname).slice(1);
      const filename = await confined(await realpath(viewerDirectory), relative);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); response.end(await readFile(filename));
    } catch (error) { send(response, error instanceof RequestError ? error.status : 500, { error: error instanceof Error ? error.message : 'Falha no runtime.' }); }
  });
  try { viewerOrigin = await listen(viewer, port); } catch (error) { content.close(); throw error; }
  let timer: ReturnType<typeof setTimeout> | undefined; const changed = new Set<string>();
  const watcher = watch(store.root, { recursive: true }, (_event, filename) => { if (!filename || filename.includes('.tmp')) return; changed.add(filename); clearTimeout(timer); timer = setTimeout(async () => {
    const files = [...changed]; changed.clear();
    const workspace = await store.snapshot();
    const frameIds = workspace.experiment.frames.filter(frame => files.some(file => file === frame.entry || file.startsWith(`${path.dirname(frame.entry)}/`) || !workspace.experiment.frames.some(candidate => file.startsWith(`${path.dirname(candidate.entry)}/`)))).map(frame => frame.id);
    if (frameIds.length) broadcast({ type: 'reload', frameIds });
    if (files.some(file => file === 'experiment.json' || file.endsWith('README.md') || file.startsWith('.draftroom') || file.startsWith('.draft'))) broadcast({ type: 'workspace' });
    if (files.some(file => file.endsWith('presence.json'))) {
      const presence = await store.loadPresence();
      broadcast({ type: 'presence', actors: presence.actors });
    }
  }, 120); });

  return { store, url: viewerOrigin, contentUrl: contentOrigin, close: async () => { clearTimeout(timer); watcher.close(); for (const client of clients) client.end(); await Promise.all([viewer, content].map(server => new Promise<void>(resolve => server.close(() => resolve())))); } };
}
