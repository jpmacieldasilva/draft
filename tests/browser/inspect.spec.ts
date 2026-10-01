import { test, expect, startViewer, runCli, api } from './harness';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const read = (folder: string, relative: string) => readFile(path.join(folder, relative), 'utf8');

test('prévia sem salvar some no reload e não entra no frame', async ({ page, studio }) => {
 const before = await read(studio.folder, 'frames/editorial/index.html');
 await page.goto(studio.url);
 const title = page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'A arte de prestar atenção', exact: true });
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await title.click();
 await page.getByRole('spinbutton', { name: 'Tamanho do texto (px)', exact: true }).fill('48');
 await expect(title).toHaveCSS('font-size', '48px');
 await expect(page.getByText('Prévia. Salvar grava no frame.', { exact: true })).toBeVisible();
 await page.reload();
 await expect(title).toHaveCSS('font-size', '23px');
 expect(await read(studio.folder, 'frames/editorial/index.html')).toBe(before);
});

test('painel flutua no elemento e a cor salva sobrevive ao reload', async ({ page, studio }) => {
 const sharedBefore = await read(studio.folder, 'shared/style.css');
 await page.goto(studio.url);
 const title = page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'A arte de prestar atenção', exact: true });
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await title.click();
 const panel = page.getByRole('complementary', { name: 'Inspector' });
 await expect(panel).toBeVisible();
 await expect(panel).not.toHaveClass(/side-panel/);
 const titleBox = await title.boundingBox();
 const panelBox = await panel.boundingBox();
 if (!titleBox || !panelBox) throw new Error('painel ou título sem caixa');
 const dx = Math.max(0, titleBox.x - (panelBox.x + panelBox.width), panelBox.x - (titleBox.x + titleBox.width));
 const dy = Math.max(0, titleBox.y - (panelBox.y + panelBox.height), panelBox.y - (titleBox.y + titleBox.height));
 expect(Math.hypot(dx, dy)).toBeLessThan(48);
 await page.getByLabel('Cor do texto').fill('#112233');
 await expect(title).toHaveCSS('color', 'rgb(17, 34, 51)');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(page.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 await expect.poll(async () => /#112233/i.test(await read(studio.folder, 'frames/editorial/index.html'))).toBe(true);
 expect(await read(studio.folder, 'shared/style.css')).toBe(sharedBefore);
 await page.reload();
 await expect(title).toHaveCSS('color', 'rgb(17, 34, 51)');
});

test('alça de espaço interno grava padding que sobrevive ao reload', async ({ page, studio }) => {
 await page.goto(studio.url);
 const title = page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'A arte de prestar atenção', exact: true });
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await title.click();
 const handle = page.getByRole('button', { name: 'Espaço interno abaixo', exact: true });
 await expect(handle).toBeVisible();
 const box = await handle.boundingBox();
 if (!box) throw new Error('alça sem caixa');
 await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
 await page.mouse.down();
 await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 36, { steps: 8 });
 await page.mouse.up();
 const padding = Number(await page.getByRole('spinbutton', { name: 'Espaço interno (px)', exact: true }).inputValue());
 expect(padding).toBeGreaterThan(8);
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(page.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 await page.reload();
 await expect(title).toHaveCSS('padding-top', `${padding}px`);
});

test('claim ativo bloqueia o Inspect e mostra o Agent', async ({ page, studio }) => {
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { name: 'A arte de prestar atenção', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Salvar ajuste', exact: true })).toBeVisible();
 expect((await runCli(['presence', 'claim', studio.folder, 'editorial', '--label', 'Agent', '--ttl', '120'])).code).toBe(0);
 const frame = page.locator('article[aria-label="Biblioteca editorial"]');
 await expect(frame).toHaveClass(/agent-active/);
 await expect(frame.locator('.agent-pill')).toHaveText('Agent');
 await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Inspect desabilitado');
 await expect(page.getByRole('button', { name: 'Salvar ajuste', exact: true })).toHaveCount(0);
 const before = await read(studio.folder, 'frames/editorial/index.html');
 const blocked = await api(studio.url, 'edits', { frameId: 'editorial', selector: '[data-draftroom-id="featured-title"]', styles: { fontSize: '40px' } });
 expect(blocked.status).toBe(409);
 expect(String(blocked.body.error)).toMatch(/Agent está neste frame/);
 expect(await read(studio.folder, 'frames/editorial/index.html')).toBe(before);
});

test('ajuste em CSS compartilhado fica só no frame editado', async ({ page, studio }) => {
 const sharedBefore = await read(studio.folder, 'shared/style.css');
 await page.goto(studio.url);
 const editorial = page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 });
 const compact = page.frameLocator('iframe[title="Leitura em movimento"]').getByRole('heading', { level: 1 });
 const compactSize = await compact.evaluate(element => getComputedStyle(element).fontSize);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await editorial.click();
 await page.getByRole('spinbutton', { name: 'Tamanho do texto (px)', exact: true }).fill('51');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(page.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 expect(await read(studio.folder, 'shared/style.css')).toBe(sharedBefore);
 await expect.poll(async () => /font-size:\s*51px/.test(await read(studio.folder, 'frames/editorial/index.html'))).toBe(true);
 await page.reload();
 await expect(editorial).toHaveCSS('font-size', '51px');
 await expect(compact).toHaveCSS('font-size', compactSize);
});

test('restaurar um seletor preserva ajustes de outros seletores', async ({ studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > h1', styles: { color: 'rgb(1, 2, 3)' } })).status).toBe(200);
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > small:nth-of-type(1)', styles: { fontSize: '31px' } })).status).toBe(200);
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > h1', remove: true })).status).toBe(200);
 const html = await read(studio.folder, 'frames/editorial/index.html');
 expect(html).not.toContain('rgb(1, 2, 3)');
 expect(html).toContain('31px');
});

test('restaurar preserva edição posterior do agente', async ({ studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > h1', styles: { fontSize: '44px' } })).status).toBe(200);
 const file = path.join(studio.folder, 'frames/editorial/index.html');
 await writeFile(file, (await readFile(file, 'utf8')).replace('Seu tempo, bem escolhido.', 'Texto escrito pelo agente.'));
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > h1', remove: true })).status).toBe(200);
 const html = await readFile(file, 'utf8');
 expect(html).toContain('Texto escrito pelo agente.');
 expect(html).not.toContain('44px');
});

test('seletor ambíguo é recusado sem tocar no arquivo', async ({ studio }) => {
 const before = await read(studio.folder, 'frames/editorial/index.html');
 const result = await api(studio.url, 'edits', { frameId: 'editorial', selector: 'small', styles: { fontSize: '40px' } });
 expect(result.status).toBe(409);
 expect(String(result.body.error)).toMatch(/mais de um elemento/i);
 expect(await read(studio.folder, 'frames/editorial/index.html')).toBe(before);
});

test('títulos com caracteres especiais geram HTML válido', async ({ page, studio }) => {
 const title = 'Plano <b>A</b> & "rápido"';
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Adicionar protótipo', exact: true }).click();
 await page.getByRole('textbox', { name: 'Nome da alternativa' }).fill(title);
 await page.getByRole('button', { name: 'Criar protótipo', exact: true }).click();
 const manifest = JSON.parse(await read(studio.folder, 'experiment.json')) as { frames: Array<{ id: string; title: string; entry: string }> };
 const created = manifest.frames.at(-1)!;
 expect(created.title).toBe(title);
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
 const legacy = { event: 'created', id: 'legacy-1', eventId: 'e1', frameId: 'editorial', message: 'Comentário antigo', createdAt: '2026-01-01T00:00:00.000Z', status: 'open', target: { kind: 'region', label: 'Área', rect: { x: 10, y: 10, width: 40, height: 40 } } };
 await writeFile(path.join(workspace, '.draftroom/feedback.jsonl'), `${JSON.stringify(legacy)}\n`);
 const expires = new Date(Date.now() + 600_000).toISOString();
 await writeFile(path.join(workspace, '.draftroom/presence.json'), JSON.stringify({ actors: [{ id: 'old-agent', label: 'Antigo', frameId: 'compact', since: new Date().toISOString(), expiresAt: expires }] }));
 const viewer = await startViewer(workspace);
 try {
  expect((await api(viewer.url, 'feedback', { frameId: 'compact', message: 'Comentário novo', target: { kind: 'region', label: 'Área', rect: { x: 1, y: 1, width: 20, height: 20 } } })).status).toBe(200);
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
