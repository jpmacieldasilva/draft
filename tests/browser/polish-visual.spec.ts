import { test, expect, api, region, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/*
 Guard for the CSS token consolidation (run on demand, not part of the default suite):
   POLISH_PHASE=before npx playwright test tests/browser/polish-visual.spec.ts   # before refactoring
   POLISH_PHASE=after  npx playwright test tests/browser/polish-visual.spec.ts   # after refactoring
 Failure modes it catches:
 1. A near-duplicate grey collapsed onto a token that is visibly different (text, border or surface shifts).
 2. Deleting a rule believed to be overridden or dead removes a style that was still in effect.
 3. Reordering the second-pass layers changes which declaration wins in the cascade.
 4. A token referenced before definition (or misspelled) silently falls back to the browser default.
 5. Responsive (<=900px) and presentation overrides stop applying after the rewrite.
*/

const PHASE = process.env.POLISH_PHASE as 'before' | 'after' | undefined;
const BASELINE = process.env.POLISH_BASELINE ?? path.join(tmpdir(), 'draft-polish-baseline');
const MAX_DIFF_RATIO = Number(process.env.POLISH_MAX_DIFF ?? '0.002');

test.skip(!PHASE, 'Set POLISH_PHASE=before|after to run the visual regression guard.');

async function settle(page: Page) {
 await page.evaluate(() => document.fonts.ready);
 await page.waitForLoadState('networkidle');
 await page.mouse.move(5, 420);
 await page.waitForTimeout(300);
}

async function diff(page: Page, before: Buffer, after: Buffer) {
 return page.evaluate(async ([a, b]) => {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
  const [one, two] = await Promise.all([load(a), load(b)]);
  if (one.width !== two.width || one.height !== two.height) return { ratio: 1, changed: -1, total: 0, png: '' };
  const canvas = (image: HTMLImageElement) => { const element = document.createElement('canvas'); element.width = image.width; element.height = image.height; const context = element.getContext('2d')!; context.drawImage(image, 0, 0); return { element, data: context.getImageData(0, 0, image.width, image.height) }; };
  const first = canvas(one), second = canvas(two);
  let changed = 0;
  for (let index = 0; index < first.data.data.length; index += 4) {
   const delta = Math.max(Math.abs(first.data.data[index] - second.data.data[index]), Math.abs(first.data.data[index + 1] - second.data.data[index + 1]), Math.abs(first.data.data[index + 2] - second.data.data[index + 2]));
   if (delta > 12) { changed++; second.data.data[index] = 255; second.data.data[index + 1] = 0; second.data.data[index + 2] = 180; second.data.data[index + 3] = 255; }
   else second.data.data[index + 3] = 60;
  }
  second.element.getContext('2d')!.putImageData(second.data, 0, 0);
  const total = one.width * one.height;
  return { ratio: changed / total, changed, total, png: second.element.toDataURL('image/png') };
 }, [`data:image/png;base64,${before.toString('base64')}`, `data:image/png;base64,${after.toString('base64')}`] as const);
}

async function capture(page: Page, name: string) {
 await settle(page);
 const shot = await page.screenshot({ animations: 'disabled', caret: 'hide' });
 await mkdir(EVIDENCE_DIR, { recursive: true });
 const baseline = path.join(BASELINE, `${name}.png`);
 if (PHASE === 'before') {
  await mkdir(BASELINE, { recursive: true });
  await writeFile(baseline, shot);
  await copyFile(baseline, path.join(EVIDENCE_DIR, `polish-before-${name}.png`));
  return;
 }
 await writeFile(path.join(EVIDENCE_DIR, `polish-after-${name}.png`), shot);
 expect(existsSync(baseline), `baseline missing: run POLISH_PHASE=before first (${baseline})`).toBe(true);
 await copyFile(baseline, path.join(EVIDENCE_DIR, `polish-before-${name}.png`));
 const blank = await page.context().newPage();
 const result = await diff(blank, await readFile(baseline), shot);
 await blank.close();
 if (result.png) await writeFile(path.join(EVIDENCE_DIR, `polish-diff-${name}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
 const report = path.join(EVIDENCE_DIR, 'polish-visual-diff.json');
 const previous = existsSync(report) ? JSON.parse(await readFile(report, 'utf8')) as Record<string, unknown> : {};
 await writeFile(report, `${JSON.stringify({ ...previous, [name]: { changedPixels: result.changed, totalPixels: result.total, ratio: result.ratio, maxRatio: MAX_DIFF_RATIO } }, null, 2)}\n`);
 expect.soft(result.ratio, `${name}: ${result.changed} of ${result.total} pixels changed`).toBeLessThanOrEqual(MAX_DIFF_RATIO);
}

test('canvas, painéis, modal e apresentação mantêm a aparência', async ({ page, studio }) => {
 test.setTimeout(90000);
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Revisar o título.', target: region('Cabeçalho') });
 await page.goto(studio.url);
 await expect(page.locator('.frame')).toHaveCount(3);
 await capture(page, 'canvas');

 await page.locator('article[data-frame-id="editorial"] .pin').click();
 await expect(page.getByRole('dialog', { name: 'Comentário', exact: true })).toBeVisible();
 await capture(page, 'comments');
 await page.keyboard.press('Escape');

 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 await expect(page.getByRole('complementary', { name: 'Inspecionar' })).toBeVisible();
 await capture(page, 'inspector');

 await page.goto(studio.url);
 await page.locator('.workspace-title').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await capture(page, 'info');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);

 await page.goto(`${studio.url}/#frame/editorial`);
 await page.reload();
 const bar = page.locator('.presentation-controls');
 await expect(bar).toBeVisible();
 await expect(bar).not.toHaveClass(/fresh/, { timeout: 5000 });
 await capture(page, 'presentation');

 await page.setViewportSize({ width: 820, height: 900 });
 await page.goto(studio.url);
 await expect(page.locator('.frame')).toHaveCount(3);
 await capture(page, 'narrow');
});
