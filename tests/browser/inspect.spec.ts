import { test, expect, startViewer, runCli, api } from './harness';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const read = (folder: string, relative: string) => readFile(path.join(folder, relative), 'utf8');

test('ajuste de tipo fica só no frame editado', async ({ page, studio }) => {
 const baseBefore = await read(studio.folder, 'frames/base/index.html');
 await page.goto(studio.url);
 const lateral = page.frameLocator('iframe[title="Compacta com barra lateral"]').getByRole('heading', { level: 1 });
 const base = page.frameLocator('iframe[title="Base clara"]').getByRole('heading', { name: /^Datas/ });
 const baseSize = await base.evaluate(element => getComputedStyle(element).fontSize);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await lateral.click();
 await page.getByRole('spinbutton', { name: 'Tamanho do texto (px)', exact: true }).fill('51');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(page.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 expect(await read(studio.folder, 'frames/base/index.html')).toBe(baseBefore);
 await expect.poll(async () => /font-size:\s*51px/.test(await read(studio.folder, 'frames/lateral/index.html'))).toBe(true);
 await page.reload();
 await expect(lateral).toHaveCSS('font-size', '51px');
 await expect(base).toHaveCSS('font-size', baseSize);
});

test('restaurar um seletor preserva ajustes de outros seletores', async ({ studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'lateral', selector: 'h1', styles: { color: 'rgb(1, 2, 3)' } })).status).toBe(200);
 expect((await api(studio.url, 'edits', { frameId: 'lateral', selector: '[data-draftroom-id="entrada"]', styles: { fontSize: '31px' } })).status).toBe(200);
 expect((await api(studio.url, 'edits', { frameId: 'lateral', selector: 'h1', remove: true })).status).toBe(200);
 const html = await read(studio.folder, 'frames/lateral/index.html');
 expect(html).not.toContain('rgb(1, 2, 3)');
 expect(html).toContain('31px');
});

test('restaurar preserva edição posterior do agente', async ({ studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'lateral', selector: 'h1', styles: { fontSize: '44px' } })).status).toBe(200);
 const file = path.join(studio.folder, 'frames/lateral/index.html');
 await writeFile(file, (await readFile(file, 'utf8')).replace('Café em grãos', 'Café escrito pelo agente.'));
 expect((await api(studio.url, 'edits', { frameId: 'lateral', selector: 'h1', remove: true })).status).toBe(200);
 const html = await readFile(file, 'utf8');
 expect(html).toContain('Café escrito pelo agente.');
 expect(html).not.toContain('44px');
});

test('seletor ambíguo é recusado sem tocar no arquivo', async ({ studio }) => {
 const before = await read(studio.folder, 'frames/base/index.html');
 const result = await api(studio.url, 'edits', { frameId: 'base', selector: 'h2', styles: { fontSize: '40px' } });
 expect(result.status).toBe(409);
 expect(String(result.body.error)).toMatch(/mais de um elemento/i);
 expect(await read(studio.folder, 'frames/base/index.html')).toBe(before);
});

test('títulos com caracteres especiais geram HTML válido', async ({ page, studio }) => {
 const title = 'Plano <b>A</b> & "rápido"';
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Adicionar protótipo', exact: true }).click();
 await page.getByRole('textbox', { name: 'Nome da alternativa' }).fill(title);
 await page.getByRole('button', { name: 'Criar protótipo', exact: true }).click();
 await expect.poll(async () => {
  const manifest = JSON.parse(await read(studio.folder, 'experiment.json')) as { frames: Array<{ title: string }> };
  return manifest.frames.at(-1)?.title;
 }).toBe(title);
 const manifest = JSON.parse(await read(studio.folder, 'experiment.json')) as { frames: Array<{ id: string; title: string; entry: string }> };
 const created = manifest.frames.at(-1)!;
 const html = await read(studio.folder, created.entry);
 expect(html).not.toContain('<b>');
 expect(html).toContain('Plano &lt;b&gt;A&lt;/b&gt; &amp; &quot;rápido&quot;');
 await expect(page.frameLocator(`iframe[title='${title}']`).getByRole('heading', { level: 1 })).toHaveText(title);

 const parent = await mkdtemp(path.join(tmpdir(), 'draft-create-'));
 try {
  const result = await runCli(['create', path.join(parent, 'novo'), title]);
  expect(result.code).toBe(0);
  const created2 = await readFile(path.join(parent, 'novo/frames/main/index.html'), 'utf8');
  expect(created2).not.toContain('<b>');
  expect(await readFile(path.join(parent, 'novo/README.md'), 'utf8')).toContain(title);
 } finally { await rm(parent, { recursive: true, force: true }); }
});

test('estado legado em .draftroom migra para .draft sem perder comentários', async ({ page, workspace }) => {
 await mkdir(path.join(workspace, '.draftroom'), { recursive: true });
 const legacy = { event: 'created', id: 'legacy-1', eventId: 'e1', frameId: 'base', message: 'Comentário antigo', createdAt: '2026-01-01T00:00:00.000Z', status: 'open', target: { kind: 'region', label: 'Área', rect: { x: 10, y: 10, width: 40, height: 40 } } };
 await writeFile(path.join(workspace, '.draftroom/feedback.jsonl'), `${JSON.stringify(legacy)}\n`);
 const expires = new Date(Date.now() + 600_000).toISOString();
 await writeFile(path.join(workspace, '.draftroom/presence.json'), JSON.stringify({ actors: [{ id: 'old-agent', label: 'Antigo', frameId: 'launcher', since: new Date().toISOString(), expiresAt: expires }] }));
 const viewer = await startViewer(workspace);
 try {
  expect((await api(viewer.url, 'feedback', { frameId: 'launcher', message: 'Comentário novo', target: { kind: 'region', label: 'Área', rect: { x: 1, y: 1, width: 20, height: 20 } } })).status).toBe(200);
  await page.goto(viewer.url);
  await page.getByRole('button', { name: /^Comentários/ }).click();
  await expect(page.getByText('Comentário antigo', { exact: true })).toBeVisible();
  await expect(page.getByText('Comentário novo', { exact: true })).toBeVisible();
  const log = await read(workspace, '.draft/feedback.jsonl');
  expect(log).toContain('Comentário antigo');
  expect(log).toContain('Comentário novo');
  const listed = await runCli(['presence', 'list', workspace]);
  expect(listed.json<{ actors: Array<{ id: string }> }>().actors.map(actor => actor.id)).toEqual(['old-agent']);
  expect((await runCli(['presence', 'clear', workspace])).code).toBe(0);
  expect((await runCli(['presence', 'list', workspace])).json<{ actors: unknown[] }>().actors).toEqual([]);
  expect(JSON.parse(await read(workspace, '.draft/presence.json'))).toEqual({ actors: [] });
 } finally { viewer.process.kill('SIGTERM'); }
});
