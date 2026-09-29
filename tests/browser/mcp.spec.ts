import { test, expect, startViewer, runCli, api, region, CLI } from './harness';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connect(folder: string) {
 const client = new Client({ name: 'draft-e2e', version: '1.0.0' });
 await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp', folder], stderr: 'pipe' }));
 const call = async <T = unknown>(name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: Array<{ type: string; text: string }> };
  const text = result.content.map(item => item.text).join('\n');
  return { isError: result.isError === true, text, json: () => JSON.parse(text) as T };
 };
 return { client, call, close: () => client.close() };
}

async function tree(folder: string, relative = ''): Promise<string[]> {
 const entries = await readdir(path.join(folder, relative), { withFileTypes: true });
 const files: string[] = [];
 for (const entry of entries) { const child = path.join(relative, entry.name); if (entry.isDirectory()) files.push(...await tree(folder, child)); else files.push(child); }
 return files.sort();
}

test('servidor MCP lista as ferramentas do Draft', async ({ workspace }) => {
 const mcp = await connect(workspace);
 try {
  const { tools } = await mcp.client.listTools();
  expect(tools.map(tool => tool.name).sort()).toEqual(['claim', 'get_context', 'get_selection', 'list_frames', 'read_frame', 'release', 'resolve_feedback', 'update_manifest', 'write_frame']);
  const frames = (await mcp.call<Array<{ id: string }>>('list_frames')).json();
  expect(frames.map(frame => frame.id)).toEqual(['editorial', 'compact', 'focus']);
  const context = (await mcp.call<{ rules: string[]; feedback: unknown[] }>('get_context')).json();
  expect(context.rules.length).toBeGreaterThan(3);
 } finally { await mcp.close(); }
});

test('write_frame recusa caminhos fora do frame', async ({ workspace }) => {
 const before = await tree(workspace);
 const mcp = await connect(workspace);
 try {
  for (const target of ['../compact/index.html', '../../experiment.json', '/tmp/evil.html', '.env', 'sub/.hidden/x.html', 'notes.txt', 'script.sh']) {
   const result = await mcp.call('write_frame', { frameId: 'editorial', path: target, content: 'x' });
   expect(result.isError, target).toBe(true);
  }
  expect((await mcp.call('write_frame', { frameId: 'fantasma', content: 'x' })).isError).toBe(true);
  expect(await tree(workspace)).toEqual(before);
  const ok = await mcp.call<{ written: string }>('write_frame', { frameId: 'editorial', path: 'parts/extra.css', content: 'h1{color:red}' });
  expect(ok.isError).toBe(false);
  expect(ok.json().written).toBe('frames/editorial/parts/extra.css');
  expect(await readFile(path.join(workspace, 'frames/editorial/parts/extra.css'), 'utf8')).toBe('h1{color:red}');
 } finally { await mcp.close(); }
});

test('write_frame respeita claims de outros atores', async ({ workspace }) => {
 expect((await runCli(['presence', 'claim', workspace, 'focus', '--label', 'Outra pessoa'])).code).toBe(0);
 const original = await readFile(path.join(workspace, 'frames/focus/index.html'), 'utf8');
 const mcp = await connect(workspace);
 try {
  const blocked = await mcp.call('write_frame', { frameId: 'focus', content: '<p>não</p>' });
  expect(blocked.isError).toBe(true);
  expect(blocked.text).toContain('Outra pessoa');
  expect(await readFile(path.join(workspace, 'frames/focus/index.html'), 'utf8')).toBe(original);
  expect((await mcp.call('claim', { frameId: 'compact', label: 'MCP' })).isError).toBe(false);
  expect((await mcp.call('write_frame', { frameId: 'compact', content: '<p>meu</p>' })).isError).toBe(false);
  expect((await mcp.call('release', { frameId: 'compact' })).isError).toBe(false);
  expect((await runCli(['presence', 'list', workspace])).json<{ actors: Array<{ frameId: string }> }>().actors.map(actor => actor.frameId)).toEqual(['focus']);
 } finally { await mcp.close(); }
});

test('get_selection segue a seleção do viewer e write_frame recarrega o frame', async ({ page, studio }) => {
 const mcp = await connect(studio.folder);
 try {
  expect((await mcp.call('get_selection')).json()).toEqual({ selection: null });
  await page.goto(studio.url);
  await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'A arte de prestar atenção' }).click();
  await expect(page.getByRole('complementary', { name: 'Inspecionar' })).toBeVisible();
  await expect.poll(async () => (await mcp.call<{ selection: { frameId: string; target: { selector: string } } | null }>('get_selection')).json().selection?.target.selector).toBe('[data-draftroom-id="featured-title"]');
  const selection = (await mcp.call<{ selection: { frameId: string } }>('get_selection')).json().selection;
  expect(selection.frameId).toBe('editorial');
  const html = (await mcp.call<{ content: string }>('read_frame', { frameId: 'editorial' })).json().content;
  expect((await mcp.call('write_frame', { frameId: 'editorial', content: html.replace('A arte de prestar atenção</h2>', 'Escrito via MCP</h2>') })).isError).toBe(false);
  await expect(page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'Escrito via MCP' })).toBeVisible();
 } finally { await mcp.close(); }
});

test('update_manifest valida e preserva campos desconhecidos', async ({ workspace }) => {
 const manifestPath = path.join(workspace, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
 manifest.owner = 'jp';
 manifest.frames[0].notes = 'manter';
 await (await import('node:fs/promises')).writeFile(manifestPath, JSON.stringify(manifest, null, 2));
 const mcp = await connect(workspace);
 try {
  const before = await readFile(manifestPath, 'utf8');
  expect((await mcp.call('update_manifest', { edges: [{ from: 'editorial', to: 'fantasma', label: '' }] })).isError).toBe(true);
  expect((await mcp.call('update_manifest', { frames: [{ id: 'fantasma', state: 'error' }] })).isError).toBe(true);
  expect(await readFile(manifestPath, 'utf8')).toBe(before);
  const ok = await mcp.call('update_manifest', { decision: { hypothesis: 'H', criteria: 'C' }, frames: [{ id: 'editorial', state: 'ready', role: 'control' }, { id: 'focus', role: 'variant' }], edges: [{ from: 'editorial', to: 'focus', label: 'Ler' }] });
  expect(ok.isError, ok.text).toBe(false);
  const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
  expect(saved).toMatchObject({ schemaVersion: 2, owner: 'jp', decision: { hypothesis: 'H', criteria: 'C' }, edges: [{ from: 'editorial', to: 'focus', label: 'Ler' }] });
  expect(saved.frames[0]).toMatchObject({ id: 'editorial', notes: 'manter', state: 'ready', role: 'control' });
  expect(saved.frames[2]).toMatchObject({ id: 'focus', role: 'variant' });
 } finally { await mcp.close(); }
});

test('resolve_feedback com id inexistente devolve erro', async ({ studio }) => {
 const created = await api(studio.url, 'feedback', { frameId: 'focus', message: 'Ajustar.', target: region() });
 const id = (created.body.feedback as Array<{ id: string }>)[0].id;
 const mcp = await connect(studio.folder);
 try {
  const missing = await mcp.call('resolve_feedback', { id: 'nao-existe' });
  expect(missing.isError).toBe(true);
  expect(missing.text).toContain('Comentário não encontrado');
  const resolved = await mcp.call<{ status: string }>('resolve_feedback', { id });
  expect(resolved.isError).toBe(false);
  expect(resolved.json().status).toBe('resolved');
  expect((await mcp.call<unknown[]>('list_frames')).isError).toBe(false);
 } finally { await mcp.close(); }
});
