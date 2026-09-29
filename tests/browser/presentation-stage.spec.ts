import { test, expect, startViewer, api, region, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/*
 Failure modes covered:
 - the iframe CSS viewport differs from the saved width once centered on the stage;
 - the scale shrinks the iframe viewport instead of only its rendering;
 - a desktop-sized frame overflows the screen or hides behind the presentation bar;
 - "Preencher tela" is not remembered, not keyboard operable, or lacks aria-pressed;
 - the position indicator is wrong after data-draft-goto, arrow-key flow jumps, or hidden frames;
 - a region drawn while presenting is stored in screen coordinates instead of the frame viewport;
 - pins are misplaced under scale, or shown in fill mode where the layout genuinely differs;
 - Escape stops closing panel → comment mode → presentation in order;
 - controls overflow on narrow screens.
*/

interface Stored { id: string; message: string; target: { rect: { x: number; y: number; width: number; height: number } } }
const bar = (page: Page) => page.locator('.presentation-controls');
const fillToggle = (page: Page) => bar(page).getByRole('button', { name: 'Preencher tela', exact: true });
const commentToggle = (page: Page) => bar(page).getByRole('button', { name: 'Comentar', exact: true });
const position = (page: Page) => bar(page).locator('.present-position');
const popover = (page: Page) => page.getByRole('dialog', { name: 'Comentário', exact: true });

async function viewportOf(page: Page, title: string) {
 const handle = await page.locator(`iframe[title="${title}"]`).elementHandle();
 const frame = await handle?.contentFrame();
 if (!frame) throw new Error(`iframe ${title} ausente`);
 await frame.waitForLoadState();
 return frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
}

async function box(page: Page, selector: string) {
 const found = await page.locator(selector).boundingBox();
 if (!found) throw new Error(`${selector} sem caixa`);
 return found;
}

async function stored(folder: string): Promise<Stored[]> {
 const text = await readFile(path.join(folder, '.draft/feedback.jsonl'), 'utf8').catch(() => '');
 const byId = new Map<string, Stored>();
 for (const line of text.trim().split('\n').filter(Boolean)) { const entry = JSON.parse(line) as Stored; byId.set(entry.id, entry); }
 return [...byId.values()];
}

async function desktopCompact(folder: string) {
 const manifestPath = path.join(folder, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
 manifest.frames.find((frame: { id: string }) => frame.id === 'compact').viewport = { width: 1920, height: 1200 };
 await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function flowStudio(folder: string) {
 const manifestPath = path.join(folder, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
 manifest.schemaVersion = 2;
 manifest.edges = [{ from: 'editorial', to: 'compact', label: 'Ver lista' }, { from: 'compact', to: 'focus', label: 'Ler agora' }];
 await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
 const editorial = path.join(folder, 'frames/editorial/index.html');
 await writeFile(editorial, (await readFile(editorial, 'utf8')).replace('<main>', '<main><a href="#" data-draft-goto="focus">Pular para o foco</a>'));
}

test('apresenta o frame no tamanho salvo, centralizado no palco', async ({ page, studio }) => {
 await page.goto(`${studio.url}/#frame/editorial`);
 await expect(fillToggle(page)).toHaveAttribute('aria-pressed', 'false');
 expect(await viewportOf(page, 'Biblioteca editorial')).toEqual({ width: 390, height: 620 });
 const frame = await box(page, '.frame.presenting iframe'), controls = await box(page, '.presentation-controls');
 expect(Math.round(frame.width)).toBe(390);
 expect(Math.round(frame.height)).toBe(620);
 expect(Math.abs(frame.x + frame.width / 2 - 720)).toBeLessThan(2);
 expect(frame.y).toBeGreaterThanOrEqual(0);
 expect(frame.y + frame.height).toBeLessThanOrEqual(controls.y);
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'presentation-stage-phone.png') });
});

test('frame maior que a tela reduz por escala sem mudar o viewport do protótipo', async ({ page, workspace }) => {
 await desktopCompact(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/compact`);
  expect(await viewportOf(page, 'Leitura em movimento')).toEqual({ width: 1920, height: 1200 });
  const frame = await box(page, '.frame.presenting iframe'), controls = await box(page, '.presentation-controls');
  expect(frame.width).toBeLessThan(1440);
  expect(frame.x).toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width).toBeLessThanOrEqual(1440);
  expect(frame.y).toBeGreaterThanOrEqual(0);
  expect(frame.y + frame.height).toBeLessThanOrEqual(controls.y);
  expect(Math.abs(frame.width / frame.height - 1.6)).toBeLessThan(0.01);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'presentation-stage-desktop-scaled.png') });
 } finally { viewer.process.kill('SIGTERM'); }
});

test('Preencher tela alterna pelo teclado, é lembrado na sessão e esconde pins', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Pin de teste.', target: region() });
 await page.goto(`${studio.url}/#frame/editorial`);
 const pins = page.locator('.frame.presenting .pin');
 await expect(pins).toHaveCount(1);
 await fillToggle(page).focus();
 await page.keyboard.press('Space');
 await expect(fillToggle(page)).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(async () => (await viewportOf(page, 'Biblioteca editorial')).width).toBe(1440);
 await expect(pins).toHaveCount(0);
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'presentation-stage-fill.png') });

 await page.reload();
 await expect(fillToggle(page)).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(async () => (await viewportOf(page, 'Biblioteca editorial')).width).toBe(1440);

 await commentToggle(page).click();
 await expect(commentToggle(page)).toHaveAttribute('aria-pressed', 'true');
 await expect(fillToggle(page)).toHaveAttribute('aria-pressed', 'false');
 await expect.poll(async () => (await viewportOf(page, 'Biblioteca editorial')).width).toBe(390);
 await expect(pins).toHaveCount(1);

 await fillToggle(page).click();
 await expect(commentToggle(page)).toHaveAttribute('aria-pressed', 'false');
 await page.keyboard.press('Escape');
 await expect(page).not.toHaveURL(/#frame\//);
 await page.getByRole('button', { name: 'Apresentar Biblioteca editorial', exact: true }).click();
 await expect(fillToggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('indicador de posição segue a ordem do estudo, saltos e frames ocultos', async ({ page, workspace }) => {
 await flowStudio(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/editorial`);
  await expect(position(page)).toHaveText('1/3Protótipo 1 de 3');
  await expect(position(page).locator('.sr-only')).toHaveText('Protótipo 1 de 3');
  await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('link', { name: 'Pular para o foco' }).click();
  await expect(position(page).locator('[aria-hidden=true]')).toHaveText('3/3');
  await page.keyboard.press('ArrowLeft');
  await expect(position(page).locator('[aria-hidden=true]')).toHaveText('1/3');
  await bar(page).click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ArrowRight');
  await expect(position(page).locator('[aria-hidden=true]')).toHaveText('2/3');
  await page.keyboard.press('Escape');

  await page.locator('article[data-frame-id="compact"] .frame-menu > summary').click();
  await page.getByRole('button', { name: 'Ocultar do canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Apresentar Um texto por vez', exact: true }).click();
  await expect(position(page).locator('[aria-hidden=true]')).toHaveText('2/2');
  await expect(position(page).locator('.sr-only')).toHaveText('Protótipo 2 de 2');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('comentário feito com escala grava coordenadas do frame e o pin coincide no canvas', async ({ page, workspace }) => {
 await desktopCompact(workspace);
 const viewer = await startViewer(workspace);
 try {
  await page.goto(`${viewer.url}/#frame/compact`);
  await commentToggle(page).click();
  const frame = await box(page, '.frame.presenting iframe');
  const scale = frame.width / 1920;
  expect(scale).toBeLessThan(1);
  const from = { x: 400, y: 300 }, to = { x: 1000, y: 700 };
  await page.frameLocator('iframe[title="Leitura em movimento"]').getByRole('heading', { level: 1 }).click();
  await popover(page).getByRole('textbox').fill('Elemento em escala.');
  await popover(page).getByRole('button', { name: 'Salvar comentário', exact: true }).click();
  await expect(page.getByText('Salvo na pasta do estudo')).toBeVisible();
  const rect = (await stored(workspace)).find(comment => comment.message === 'Elemento em escala.')!.target.rect;
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);

  const relative = async (selector: string) => {
   const pin = await box(page, `${selector} .pin`), content = await box(page, `${selector} iframe`);
   return { x: (pin.x - content.x) / content.width, y: (pin.y - content.y) / content.height };
  };
  const presented = await relative('.frame.presenting');
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'presentation-stage-pin-scaled.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/#frame\//);
  const onCanvas = await relative('article[data-frame-id="compact"]');
  expect(Math.abs(presented.x - onCanvas.x)).toBeLessThan(0.005);
  expect(Math.abs(presented.y - onCanvas.y)).toBeLessThan(0.005);
  expect(Math.abs(presented.x - (rect.x - 9) / 1920)).toBeLessThan(0.01);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('em tela estreita os controles cabem e o protótipo mantém o viewport salvo', async ({ page, studio }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto(`${studio.url}/#frame/editorial`);
 await expect(position(page)).toBeVisible();
 const controls = await box(page, '.presentation-controls');
 expect(controls.x).toBeGreaterThanOrEqual(0);
 expect(controls.x + controls.width).toBeLessThanOrEqual(390);
 for (const button of await bar(page).getByRole('button').all()) {
  const found = await button.boundingBox();
  expect(found).not.toBeNull();
  expect(found!.x).toBeGreaterThanOrEqual(0);
  expect(found!.x + found!.width).toBeLessThanOrEqual(390);
 }
 expect(await viewportOf(page, 'Biblioteca editorial')).toEqual({ width: 390, height: 620 });
 const frame = await box(page, '.frame.presenting iframe');
 expect(frame.x).toBeGreaterThanOrEqual(0);
 expect(frame.x + frame.width).toBeLessThanOrEqual(390);
 expect(frame.y + frame.height).toBeLessThanOrEqual(controls.y);
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'presentation-stage-narrow.png') });
});
