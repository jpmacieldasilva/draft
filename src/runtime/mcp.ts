import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Frame } from '../protocol.js';
import { buildContext, feedbackItems } from './agent.js';
import { RequestError, WorkspaceStore, confined, discoverExperiment, publicPath } from './workspace.js';

const MAX_CONTENT = 2 * 1024 * 1024;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
function reply(value: unknown): ToolResult { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }; }
function failure(error: unknown): ToolResult { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }; }
function tool<T>(run: (args: T) => Promise<unknown>) { return async (args: T): Promise<ToolResult> => { try { return reply(await run(args)); } catch (error) { return failure(error); } }; }

async function findFrame(store: WorkspaceStore, frameId: string): Promise<Frame> {
  const frame = (await discoverExperiment(store.root)).experiment.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new RequestError(`Frame não encontrado: ${frameId}.`, 404);
  return frame;
}

/** Only public assets or Markdown under the frame's own folder; dot segments, `..` and absolute paths never reach the filesystem. */
function frameFile(frame: Frame, relative: string | undefined) {
  const directory = path.posix.dirname(frame.entry);
  if (directory === '.' || !directory.startsWith('frames/')) throw new RequestError(`O frame ${frame.id} precisa ter uma pasta própria em frames/<id>/.`);
  const file = relative ?? path.posix.basename(frame.entry);
  if (!file || file.length > 300 || file.includes('\\') || file.includes('\0') || path.posix.isAbsolute(file)) throw new RequestError(`Caminho inválido: ${file}`);
  if (file.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) throw new RequestError(`Caminho inválido: ${file}`);
  const full = `${directory}/${file}`;
  if (!publicPath(full) && path.posix.extname(full).toLowerCase() !== '.md') throw new RequestError(`Tipo de arquivo não permitido: ${file}`);
  return { directory, full };
}

async function existingAncestor(target: string, boundary: string) {
  let current = target;
  while (current.startsWith(boundary)) { try { return await realpath(current); } catch { current = path.dirname(current); } }
  return boundary;
}

export async function serveMcp(folder: string) {
  console.log = (...values: unknown[]) => console.error(...values);
  const store = new WorkspaceStore(folder);
  await store.initialize();
  const actorId = `mcp-${randomUUID()}`;
  let actorLabel = 'MCP';

  async function claimedByOther(frameId: string) {
    return (await store.loadPresence()).actors.find(actor => actor.frameId === frameId && actor.id !== actorId);
  }

  const server = new McpServer({ name: 'draft', version: '0.3.0' });

  server.registerTool('list_frames', { description: 'Frames do estudo com estado, papel, arquivos, feedback aberto e claims.' },
    tool(async () => (await buildContext(store)).frames));
  server.registerTool('get_context', { description: 'Contexto completo do estudo: frames, edges, decision, feedback aberto, presença, diagnósticos e regras de edição.' },
    tool(async () => buildContext(store)));
  server.registerTool('get_selection', { description: 'Elemento ou região selecionado agora no viewer (Inspect ou Comentar), ou null.' },
    tool(async () => store.readSelection()));
  server.registerTool('claim', {
    description: 'Marca este agente como editando um frame; o viewer bloqueia o Inspect nele.',
    inputSchema: { frameId: z.string(), label: z.string().max(80).optional(), ttlSeconds: z.number().int().positive().max(86400).optional() },
  }, tool(async ({ frameId, label, ttlSeconds }: { frameId: string; label?: string; ttlSeconds?: number }) => {
    const other = await claimedByOther(frameId);
    if (other) throw new RequestError(`Frame ${frameId} está em uso por ${other.label}.`, 409);
    if (label?.trim()) actorLabel = label.trim();
    return (await store.claim({ id: actorId, label: actorLabel, frameId, ttlSeconds })).actor;
  }));
  server.registerTool('release', {
    description: 'Libera o claim deste agente.',
    inputSchema: { frameId: z.string().optional() },
  }, tool(async ({ frameId }: { frameId?: string }) => {
    const mine = (await store.loadPresence()).actors.find(actor => actor.id === actorId);
    if (frameId && mine && mine.frameId !== frameId) throw new RequestError(`Este agente não tem claim em ${frameId}.`);
    return store.clearPresence({ id: actorId });
  }));
  server.registerTool('read_frame', {
    description: 'Lê um arquivo do frame (padrão: o HTML de entrada).',
    inputSchema: { frameId: z.string(), path: z.string().optional() },
  }, tool(async ({ frameId, path: relative }: { frameId: string; path?: string }) => {
    const { full } = frameFile(await findFrame(store, frameId), relative);
    return { path: full, content: await readFile(await confined(store.root, full), 'utf8') };
  }));
  server.registerTool('write_frame', {
    description: 'Escreve um arquivo dentro de frames/<frameId>/ (padrão: o HTML de entrada). Recusado se outro ator tiver claim no frame.',
    inputSchema: { frameId: z.string(), path: z.string().optional(), content: z.string() },
  }, tool(async ({ frameId, path: relative, content }: { frameId: string; path?: string; content: string }) => {
    const { directory, full } = frameFile(await findFrame(store, frameId), relative);
    if (Buffer.byteLength(content) > MAX_CONTENT) throw new RequestError('Conteúdo muito grande.', 413);
    const other = await claimedByOther(frameId);
    if (other) throw new RequestError(`Frame ${frameId} está em uso por ${other.label}.`, 409);
    const frameDirectory = await confined(store.root, directory);
    const destination = path.join(frameDirectory, ...full.slice(directory.length + 1).split('/'));
    const ancestor = await existingAncestor(path.dirname(destination), frameDirectory);
    if (ancestor !== frameDirectory && !ancestor.startsWith(`${frameDirectory}${path.sep}`)) throw new RequestError('Arquivo fora do frame.', 403);
    await mkdir(path.dirname(destination), { recursive: true });
    if ((await realpath(path.dirname(destination))) !== path.dirname(destination)) throw new RequestError('Arquivo fora do frame.', 403);
    try { if ((await lstat(destination)).isSymbolicLink()) throw new RequestError('O destino não pode ser um symlink.', 403); } catch (error) { if (error instanceof RequestError) throw error; }
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, destination);
    return { written: full };
  }));
  server.registerTool('resolve_feedback', {
    description: 'Marca um comentário como resolvido (ou reabre com status "open").',
    inputSchema: { id: z.string(), status: z.enum(['resolved', 'open']).optional() },
  }, tool(async ({ id, status }: { id: string; status?: 'resolved' | 'open' }) => {
    const workspace = await store.feedback({ status: status ?? 'resolved' }, id);
    return feedbackItems(workspace.feedback.filter(item => item.id === id))[0];
  }));
  server.registerTool('update_manifest', {
    description: 'Atualiza título, decision, metadados de frames (state, role, group, tests, signal) e edges no experiment.json. Tudo é validado antes de escrever; campos desconhecidos são preservados.',
    inputSchema: {
      title: z.string().optional(),
      decision: z.object({ hypothesis: z.string().optional(), criteria: z.string().optional() }).optional(),
      frames: z.array(z.object({ id: z.string(), title: z.string().optional(), state: z.string().nullable().optional(), role: z.enum(['control', 'variant']).nullable().optional(), group: z.string().nullable().optional(), tests: z.string().nullable().optional(), signal: z.string().nullable().optional() })).optional(),
      edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).optional(),
    },
  }, tool(async (args: Record<string, unknown>) => {
    const { experiment } = await store.updateManifest(args);
    return { title: experiment.title, decision: experiment.decision, frames: experiment.frames.map(({ url: _url, readme: _readme, ...frame }) => frame), edges: experiment.edges };
  }));

  const transport = new StdioServerTransport();
  const shutdown = () => { void (async () => { if ((await store.loadPresence()).actors.some(actor => actor.id === actorId)) await store.clearPresence({ id: actorId }); })().catch(() => undefined).finally(() => process.exit(0)); };
  process.stdin.once('end', shutdown);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await server.connect(transport);
}
