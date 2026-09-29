import { test, expect, startViewer, runCli, api, PROTOTYPE_LINKS_UI } from './harness';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

type Manifest = Record<string, unknown> & { schemaVersion?: number; frames: Array<Record<string, unknown>>; edges?: Array<{ from: string; to: string; label: string }>; decision?: Record<string, string> };
const readManifest = async (folder: string) => JSON.parse(await readFile(path.join(folder, 'experiment.json'), 'utf8')) as Manifest;
async function writeManifest(folder: string, change: (manifest: Manifest) => Manifest) { await writeFile(path.join(folder, 'experiment.json'), JSON.stringify(change(await readManifest(folder)), null, 2)); }

test('manifesto v1 sem schemaVersion abre sem ser reescrito', async ({ page, studio }) => {
 const before = await readFile(path.join(studio.folder, 'experiment.json'), 'utf8');
 expect(JSON.parse(before).schemaVersion).toBeUndefined();
 await page.goto(studio.url);
 await expect(page.locator('iframe')).toHaveCount(3);
 await expect(page.getByRole('alert')).toHaveCount(0);
 expect(await readFile(path.join(studio.folder, 'experiment.json'), 'utf8')).toBe(before);
});

test('migra conexões do layout para edges sem perder campos desconhecidos', async ({ page, workspace }) => {
 await writeManifest(workspace, manifest => ({ ...manifest, owner: 'jp', frames: manifest.frames.map(frame => frame.id === 'focus' ? { ...frame, notes: 'manter' } : frame) }));
 await mkdir(path.join(workspace, '.draft'), { recursive: true });
 const position = { x: 0, y: 0, width: 390, height: 620 };
 await writeFile(path.join(workspace, '.draft/layout.json'), JSON.stringify({ zoom: 0.65, x: 0, y: 0, frames: { editorial: position, compact: { ...position, x: 500 }, focus: { ...position, x: 1000 } }, connections: [{ id: 'c1', from: 'editorial', to: 'compact', label: 'Abrir lista' }] }));
 const viewer = await startViewer(workspace);
 try {
  const manifest = await readManifest(workspace);
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.owner).toBe('jp');
  expect(manifest.frames.find(frame => frame.id === 'focus')?.notes).toBe('manter');
  expect(manifest.edges).toEqual([{ from: 'editorial', to: 'compact', label: 'Abrir lista' }]);
  const layout = JSON.parse(await readFile(path.join(workspace, '.draft/layout.json'), 'utf8'));
  expect(layout.connections).toBeUndefined();
  expect(layout.frames.compact.x).toBe(500);
  await page.goto(viewer.url);
  await expect(page.locator('.flow-label')).toHaveCount(PROTOTYPE_LINKS_UI ? 1 : 0);
  if (PROTOTYPE_LINKS_UI) await expect(page.locator('.flow-label')).toHaveText('Abrir lista');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('aresta para frame inexistente ou duplicada é ignorada com aviso', async ({ page, workspace }) => {
 await writeManifest(workspace, manifest => ({ ...manifest, schemaVersion: 2, edges: [{ from: 'editorial', to: 'compact', label: 'Ir' }, { from: 'editorial', to: 'fantasma', label: 'Nada' }, { from: 'editorial', to: 'compact', label: 'De novo' }] }));
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await expect(page.locator('.flow-label')).toHaveCount(PROTOTYPE_LINKS_UI ? 1 : 0);
  if (PROTOTYPE_LINKS_UI) await expect(page.locator('.flow-label')).toHaveText('Ir');
  await expect(page.getByRole('alert')).toContainText('frame inexistente');
  await expect(page.getByRole('alert')).toContainText('duplicada');
  const rejected = await api(viewer.url, 'edges', { edges: [{ from: 'editorial', to: 'fantasma', label: '' }] });
  expect(rejected.status).toBe(400);
  const duplicated = await api(viewer.url, 'edges', { edges: [{ from: 'editorial', to: 'compact', label: '' }, { from: 'editorial', to: 'compact', label: 'x' }] });
  expect(duplicated.status).toBe(400);
  expect((await readManifest(workspace)).edges).toHaveLength(3);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('ciclos no fluxo não travam viewer nem context', async ({ page, workspace }) => {
 await writeManifest(workspace, manifest => ({ ...manifest, schemaVersion: 2, edges: [{ from: 'editorial', to: 'compact', label: 'ida' }, { from: 'compact', to: 'focus', label: 'depois' }, { from: 'focus', to: 'editorial', label: 'volta' }] }));
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await expect(page.locator('.flow-label')).toHaveCount(PROTOTYPE_LINKS_UI ? 3 : 0);
  const context = await runCli(['context', workspace]);
  expect(context.code).toBe(0);
  expect(context.json<{ edges: unknown[] }>().edges).toHaveLength(3);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('mais de um controle no mesmo grupo gera aviso', async ({ page, workspace }) => {
 await writeManifest(workspace, manifest => ({ ...manifest, schemaVersion: 2, frames: manifest.frames.map(frame => ({ ...frame, group: 'home', role: frame.id === 'focus' ? 'variant' : 'control' })) }));
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await expect(page.getByRole('alert')).toContainText('Mais de um controle no grupo "home"');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('renomear e duplicar preservam decisão, arestas e papéis', async ({ page, workspace }) => {
 await writeManifest(workspace, manifest => ({ ...manifest, schemaVersion: 2, decision: { hypothesis: 'Menos opções aumentam leitura.', criteria: 'Mais textos abertos.' }, edges: [{ from: 'editorial', to: 'focus', label: 'Ler' }], frames: manifest.frames.map(frame => frame.id === 'editorial' ? { ...frame, role: 'control', state: 'ready' } : { ...frame, role: 'variant' }) }));
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await page.getByLabel('Opções de Leitura em movimento').click();
  await page.getByRole('textbox', { name: 'Novo título' }).fill('Leitura rápida');
  await page.getByRole('button', { name: 'Renomear', exact: true }).click();
  await expect(page.locator('iframe[title="Leitura rápida"]')).toBeVisible();
  await page.getByLabel('Opções de Biblioteca editorial').click();
  await page.getByRole('button', { name: 'Duplicar alternativa', exact: true }).first().click();
  await expect(page.locator('iframe')).toHaveCount(4);
  const manifest = await readManifest(workspace);
  expect(manifest.decision).toEqual({ hypothesis: 'Menos opções aumentam leitura.', criteria: 'Mais textos abertos.' });
  expect(manifest.edges).toEqual([{ from: 'editorial', to: 'focus', label: 'Ler' }]);
  expect(manifest.frames.find(frame => frame.id === 'compact')).toMatchObject({ title: 'Leitura rápida', role: 'variant' });
  expect(manifest.frames.find(frame => frame.id === 'editorial')).toMatchObject({ role: 'control', state: 'ready' });
  const copy = manifest.frames.find(frame => String(frame.id).startsWith('editorial-copy-'));
  expect(copy).toMatchObject({ role: 'variant', state: 'ready' });
 } finally { viewer.process.kill('SIGTERM'); }
});

test('create --flow gera estados ligados', async ({ page }) => {
 const parent = await mkdtemp(path.join(tmpdir(), 'draft-flow-'));
 const folder = path.join(parent, 'checkout');
 try {
  const result = await runCli(['create', folder, 'Checkout', '--flow']);
  expect(result.code).toBe(0);
  const manifest = await readManifest(folder);
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.frames.map(frame => [frame.id, frame.state])).toEqual([['empty', 'empty'], ['loading', 'loading'], ['success', 'success'], ['error', 'error']]);
  const ids = new Set(manifest.frames.map(frame => frame.id));
  expect(manifest.edges?.length).toBe(4);
  for (const edge of manifest.edges ?? []) { expect(ids.has(edge.from)).toBe(true); expect(ids.has(edge.to)).toBe(true); }
  expect(manifest.edges).toContainEqual({ from: 'error', to: 'loading', label: 'Tentar de novo' });
  const viewer = await startViewer(folder);
  try {
   await page.goto(viewer.url);
   await expect(page.locator('iframe')).toHaveCount(4);
   await expect(page.locator('.flow-label')).toHaveCount(PROTOTYPE_LINKS_UI ? 4 : 0);
   await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { viewer.process.kill('SIGTERM'); }
 } finally { await rm(parent, { recursive: true, force: true }); }
});

async function abTest(folder: string) {
 await writeManifest(folder, manifest => ({ ...manifest, schemaVersion: 2,
  decision: { hypothesis: 'Um texto por vez aumenta leituras concluídas.', criteria: 'Mais leituras concluídas por sessão.' },
  frames: manifest.frames.map(frame => ({
   ...frame, group: 'biblioteca',
   ...(frame.id === 'editorial' ? { role: 'control', state: 'ready', tests: 'Descoberta editorial atual.', signal: 'reading_started' } : {}),
   ...(frame.id === 'focus' ? { role: 'variant', state: 'ready', tests: 'Foco em um texto.', signal: 'reading_completed' } : {}),
   ...(frame.id === 'compact' ? { role: 'variant', state: 'loading' } : {}),
  })) }));
}

test('selos de estado e papel aparecem no cabeçalho do frame', async ({ page, workspace }) => {
 await abTest(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await expect(page.locator('article[aria-label="Biblioteca editorial"] .frame-badge')).toHaveText(['ready', 'Controle']);
  await expect(page.locator('article[aria-label="Leitura em movimento"] .frame-badge')).toHaveText(['loading', 'Variante']);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('decisão, teste e sinal aparecem no painel de informações', async ({ page, workspace }) => {
 await abTest(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await page.getByRole('button', { name: 'Um espaço para ler', exact: false }).click();
  const sheet = page.getByRole('dialog', { name: 'Informações' });
  await expect(sheet.locator('.decision')).toContainText('Hipótese');
  await expect(sheet.locator('.decision')).toContainText('Um texto por vez aumenta leituras concluídas.');
  await expect(sheet.locator('.decision')).toContainText('Mais leituras concluídas por sessão.');
  await page.getByRole('button', { name: 'Fechar informações' }).click();
  await page.getByRole('button', { name: 'Informações de Um texto por vez', exact: true }).click();
  await expect(sheet.locator('.frame-meta')).toContainText('Foco em um texto.');
  await expect(sheet.locator('.frame-meta')).toContainText('reading_completed');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('comparar mostra controle e variante lado a lado com o critério', async ({ page, studio }) => {
 await page.goto(studio.url);
 await expect(page.getByRole('button', { name: 'Comparar', exact: true })).toHaveCount(0);
 await abTest(studio.folder);
 await expect(page.getByRole('button', { name: 'Comparar', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Comparar', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Comparar controle e variante' });
 await expect(dialog).toContainText('Mais leituras concluídas por sessão.');
 await expect(dialog.locator('iframe[title="Controle: Biblioteca editorial"]')).toBeVisible();
 await expect(dialog.locator('iframe[title="Variante: Leitura em movimento"]')).toBeVisible();
 await dialog.getByRole('combobox', { name: 'Variante' }).selectOption('focus');
 await expect(dialog.locator('iframe[title="Variante: Um texto por vez"]')).toBeVisible();
 await expect(dialog).toContainText('Foco em um texto.');
 await expect(dialog.frameLocator('iframe[title="Variante: Um texto por vez"]').getByRole('heading', { level: 1 })).toBeVisible();
 await dialog.getByRole('button', { name: 'Fechar comparação' }).click();
 await expect(dialog).toHaveCount(0);
});
