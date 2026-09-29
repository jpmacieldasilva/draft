import { test, expect, startViewer, api, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/*
 Failure modes this spec guards (written before the implementation):
 1. The path shown before saving is not where the change lands (nested entry, e.g. frames/editorial/pages/alt.html).
 2. The save confirmation does not name the file or misstates the change (wrong before/after values).
 3. Undo does not actually revert the file on disk.
 4. Undo reverts edits of other elements (other selectors in the same file).
 5. Undo after the file changed externally on the same property overwrites that external change.
 6. The success message (and its Undo) persists after a new, unsaved edit and reassures about the wrong state.
 7. "Restaurar original" writes on the first click, without confirmation.
 8. Escape on the confirmation writes, or closes the whole panel instead of only the confirmation.
 9. Cancel on the confirmation writes.
 10. After an undo, "Restaurar original" no longer removes what Draft wrote.
 11. The fields show stale pre-save values after the frame reloads.
*/

const read = (folder: string, relative: string) => readFile(path.join(folder, relative), 'utf8');
const panel = (page: Page) => page.getByRole('complementary', { name: 'Inspecionar' });
const heading = (page: Page) => page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 });
const fontSize = (page: Page) => page.getByRole('spinbutton', { name: 'Tamanho do texto (px)', exact: true });
const savedStatus = (page: Page) => panel(page).getByRole('status').filter({ hasText: 'Salvo em' });

async function inspectHeading(page: Page, url: string) {
 await page.goto(url);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await heading(page).click();
 await expect(panel(page)).toBeVisible();
 await expect(fontSize(page)).toBeVisible();
}

test('mostra o arquivo de destino mesmo com entrada aninhada', async ({ page, workspace }) => {
 await mkdir(path.join(workspace, 'frames/editorial/pages'), { recursive: true });
 await writeFile(path.join(workspace, 'frames/editorial/pages/alt.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Alt</title></head><body><main><h1>Página interna</h1></main></body></html>');
 const manifestPath = path.join(workspace, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frames: Array<{ id: string; entry: string }> };
 manifest.frames.find(frame => frame.id === 'editorial')!.entry = 'frames/editorial/pages/alt.html';
 await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
 const indexBefore = await read(workspace, 'frames/editorial/index.html');
 const viewer = await startViewer(workspace);
 try {
  await inspectHeading(page, viewer.url);
  await expect(panel(page).locator('.editor-target')).toHaveText('Grava em frames/editorial/pages/alt.html');
  await fontSize(page).fill('40');
  await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
  await expect(savedStatus(page)).toContainText('Salvo em frames/editorial/pages/alt.html');
  await expect.poll(async () => /font-size:\s*40px/.test(await read(workspace, 'frames/editorial/pages/alt.html'))).toBe(true);
  expect(await read(workspace, 'frames/editorial/index.html')).toBe(indexBefore);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('confirma o arquivo e o que mudou, e desfazer reverte só este ajuste', async ({ page, studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > small:nth-of-type(1)', styles: { fontSize: '31px' } })).status).toBe(200);
 await inspectHeading(page, studio.url);
 await expect(panel(page).locator('.editor-target')).toHaveText('Grava em frames/editorial/index.html');
 const original = await heading(page).evaluate(element => getComputedStyle(element).fontSize);
 await fontSize(page).fill('51');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(savedStatus(page)).toContainText('Salvo em frames/editorial/index.html');
 await expect(savedStatus(page)).toContainText(`font-size ${original} → 51px`);
 await expect.poll(async () => /font-size:\s*51px/.test(await read(studio.folder, 'frames/editorial/index.html'))).toBe(true);
 await expect(heading(page)).toHaveCSS('font-size', '51px');
 await expect(fontSize(page)).toHaveValue('51');
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'inspect-save-confirmation.png') });

 await panel(page).getByRole('button', { name: 'Desfazer', exact: true }).click();
 await expect(panel(page).getByRole('status').filter({ hasText: 'Ajuste desfeito em frames/editorial/index.html' })).toBeVisible();
 await expect.poll(async () => /font-size:\s*51px/.test(await read(studio.folder, 'frames/editorial/index.html'))).toBe(false);
 expect(await read(studio.folder, 'frames/editorial/index.html')).toMatch(/font-size:\s*31px/);
 await expect(heading(page)).toHaveCSS('font-size', original);
 await expect(fontSize(page)).toHaveValue(String(parseFloat(original)));

 await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
 await page.getByRole('button', { name: 'Remover ajustes', exact: true }).click();
 await expect.poll(async () => /<h1>/.test(await read(studio.folder, 'frames/editorial/index.html'))).toBe(true);
 expect(await read(studio.folder, 'frames/editorial/index.html')).toMatch(/font-size:\s*31px/);
});

test('mensagem de salvo some quando um novo ajuste começa', async ({ page, studio }) => {
 await inspectHeading(page, studio.url);
 await fontSize(page).fill('44');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(savedStatus(page)).toBeVisible();
 await fontSize(page).fill('45');
 await expect(savedStatus(page)).toHaveCount(0);
 await expect(panel(page).getByRole('button', { name: 'Desfazer', exact: true })).toHaveCount(0);
});

test('restaurar original pede confirmação; Esc e Cancelar não gravam', async ({ page, studio }) => {
 expect((await api(studio.url, 'edits', { frameId: 'editorial', selector: 'body > main > h1', styles: { color: 'rgb(1, 2, 3)' } })).status).toBe(200);
 const file = 'frames/editorial/index.html';
 const edited = await read(studio.folder, file);
 expect(edited).toContain('rgb(1, 2, 3)');
 await inspectHeading(page, studio.url);
 const question = panel(page).getByText('Remover os ajustes salvos neste elemento?', { exact: false });

 await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
 await expect(question).toBeVisible();
 await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'inspect-restore-confirm.png') });
 await page.keyboard.press('Escape');
 await expect(question).toHaveCount(0);
 await expect(panel(page)).toBeVisible();
 await expect(page.getByRole('button', { name: 'Restaurar original', exact: true })).toBeFocused();
 await page.waitForTimeout(400);
 expect(await read(studio.folder, file)).toBe(edited);

 await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
 await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
 await expect(question).toHaveCount(0);
 await page.waitForTimeout(400);
 expect(await read(studio.folder, file)).toBe(edited);

 await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
 await page.getByRole('button', { name: 'Remover ajustes', exact: true }).click();
 await expect(panel(page).getByRole('status').filter({ hasText: 'Ajustes removidos de frames/editorial/index.html' })).toBeVisible();
 await expect.poll(async () => (await read(studio.folder, file)).includes('rgb(1, 2, 3)')).toBe(false);
});

test('desfazer recusa quando o arquivo mudou depois do ajuste', async ({ page, studio }) => {
 const file = 'frames/editorial/index.html';
 await inspectHeading(page, studio.url);
 await fontSize(page).fill('51');
 await page.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(savedStatus(page)).toBeVisible();
 await expect.poll(async () => /font-size:\s*51px/.test(await read(studio.folder, file))).toBe(true);
 await expect(fontSize(page)).toHaveValue('51');
 await writeFile(path.join(studio.folder, file), (await read(studio.folder, file)).replace(/font-size:\s*51px/, 'font-size: 60px'));
 await expect(heading(page)).toHaveCSS('font-size', '60px');
 await expect(fontSize(page)).toHaveValue('60');
 await panel(page).getByRole('button', { name: 'Desfazer', exact: true }).click();
 await expect(panel(page).getByRole('alert')).toContainText('O arquivo mudou depois deste ajuste');
 await page.waitForTimeout(400);
 expect(await read(studio.folder, file)).toMatch(/font-size:\s*60px/);
});
