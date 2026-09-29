import { test, expect, startViewer, runCli, api, region } from './harness';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import type { Page } from '@playwright/test';

async function flowStudio(folder: string) {
 const manifestPath = path.join(folder, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
 manifest.schemaVersion = 2;
 manifest.edges = [{ from: 'editorial', to: 'compact', label: 'Ver lista' }, { from: 'compact', to: 'focus', label: 'Ler agora' }, { from: 'focus', to: 'editorial', label: 'Voltar ao início' }];
 await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
 const editorial = path.join(folder, 'frames/editorial/index.html');
 await writeFile(editorial, (await readFile(editorial, 'utf8')).replace('<main>', '<main><a href="#" data-draft-goto="compact">Ir para a lista</a><button data-draft-goto="fantasma">Destino quebrado</button>'));
}

const presentingTitle = (page: Page) => page.locator('.presentation-controls > span');

test('data-draft-goto navega entre frames na apresentação', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/editorial`);
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('link', { name: 'Ir para a lista' }).click();
  await expect(page).toHaveURL(/#frame\/compact$/);
  await expect(presentingTitle(page)).toHaveText('Leitura em movimento');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('destino inexistente avisa e mantém o frame atual', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/editorial`);
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('button', { name: 'Destino quebrado' }).click();
  await expect(page.getByRole('alert')).toContainText('Destino não encontrado: fantasma');
  await expect(page).toHaveURL(/#frame\/editorial$/);
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('links de fluxo não navegam em Inspecionar', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('link', { name: 'Ir para a lista' }).click();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await expect(page.locator('article.selected')).toHaveAttribute('data-frame-id', 'editorial');
  await expect(page.locator('.presentation-controls')).toHaveCount(0);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('no canvas o link de fluxo seleciona o destino', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('link', { name: 'Ir para a lista' }).click();
  await expect(page.locator('article.selected')).toHaveAttribute('data-frame-id', 'compact');
  await expect(page.locator('.presentation-controls')).toHaveCount(0);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('setas seguem edges, voltam pelo histórico e atravessam ciclos', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/editorial`);
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
  await page.locator('.presentation-controls').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ArrowRight');
  await expect(presentingTitle(page)).toHaveText('Leitura em movimento');
  await page.keyboard.press('ArrowRight');
  await expect(presentingTitle(page)).toHaveText('Um texto por vez');
  await page.keyboard.press('ArrowRight');
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
  await page.keyboard.press('ArrowRight');
  await expect(presentingTitle(page)).toHaveText('Leitura em movimento');
  await page.keyboard.press('ArrowLeft');
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
  await page.keyboard.press('ArrowLeft');
  await expect(presentingTitle(page)).toHaveText('Um texto por vez');
  const focus = page.frameLocator('iframe[title="Um texto por vez"]');
  await focus.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('ArrowRight');
  await expect(presentingTitle(page)).toHaveText('Biblioteca editorial');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('apresentação lista os próximos passos do fluxo', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/compact`);
  const next = page.getByRole('navigation', { name: 'Próximos passos' });
  await expect(next.getByRole('button')).toHaveText(['Ler agora']);
  await next.getByRole('button', { name: 'Ler agora' }).click();
  await expect(presentingTitle(page)).toHaveText('Um texto por vez');
  await expect(next.getByRole('button')).toHaveText(['Voltar ao início']);
 } finally { viewer.process.kill('SIGTERM'); }
});

async function serveStatic(root: string) {
 const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
 const server = createServer(async (request, response) => {
  try {
   let entry = path.join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname));
   if (entry.endsWith(path.sep) || !path.extname(entry)) entry = path.join(entry, 'index.html');
   response.setHeader('Content-Type', types[path.extname(entry)] ?? 'application/octet-stream');
   response.end(await readFile(entry));
  } catch { response.writeHead(404); response.end(); }
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 if (!address || typeof address === 'string') throw new Error('Porta inválida');
 return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('export leva arestas e comentários somente leitura', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 const output = await mkdtemp(path.join(tmpdir(), 'draft-export-'));
 try {
  expect((await api(viewer.url, 'feedback', { frameId: 'compact', message: 'Revisar a ordem.', target: region() })).status).toBe(200);
  viewer.process.kill('SIGTERM');
  expect((await runCli(['export', workspace, path.join(output, 'full')])).code).toBe(0);
  expect((await runCli(['export', workspace, path.join(output, 'clean'), '--no-feedback'])).code).toBe(0);
  const clean = JSON.parse(await readFile(path.join(output, 'clean/workspace.json'), 'utf8'));
  expect(clean.feedback).toEqual([]);
  expect(clean.experiment.edges).toHaveLength(3);
  const server = await serveStatic(output);
  try {
   await page.goto(`${server.url}/full/index.html`);
   await expect(page.locator('.flow-label')).toHaveText(['Ver lista', 'Ler agora', 'Voltar ao início']);
   await page.getByRole('button', { name: /^Comentários/ }).click();
   await expect(page.getByText('Revisar a ordem.', { exact: true })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Resolver', exact: true })).toHaveCount(0);
   await page.goto(`${server.url}/full/index.html#frame/editorial`);
   await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('link', { name: 'Ir para a lista' }).click();
   await expect(presentingTitle(page)).toHaveText('Leitura em movimento');
  } finally { await server.close(); }
 } finally { viewer.process.kill('SIGTERM'); await rm(output, { recursive: true, force: true }); }
});
