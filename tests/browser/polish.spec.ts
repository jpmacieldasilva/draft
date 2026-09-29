import { test, expect, api, region, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/*
 Failure modes this spec guards (written before the implementation):
 Top bar
 1. "Comparar" is the only top-bar action rendered as bare text, without an icon.
 2. Adding the icon changes the button's accessible name (other specs address it as exactly "Comparar").
 3. At <=900px the comments toggle collapses to a lone number: its icon disappears or shrinks to nothing.
 4. At <=900px the toggle's accessible name no longer says what the number counts ("Comentários 1" / "1").
 5. The open-count chip drops below the 11px caption floor at <=900px.
 6. The workspace title shows a dropdown chevron although it opens a dialog, not a menu.
 7. The title's accessible name loses the workspace title, or it does not announce that it opens a dialog.
 Toolbar
 8. The zoom percentage button and the fit button do the same thing (both fit).
 9. The percentage button does not land on exactly 100%.
 10. The percentage button is still titled "Centralizar", so two controls claim the same action.
 11. The "0" shortcut stops fitting, or the fit button loses its "Centralizar frames" name.
 Markdown in the info sheet
 12. *italic* and **bold** print literal asterisks.
 13. Raw HTML in a README is interpreted instead of shown as text.
 14. A lone asterisk (2 * 3) or an unmatched one is swallowed or starts italics that eat the rest of the line.
*/

const zoomLabel = (page: Page) => page.locator('.toolbar .zoom');

test('Comparar tem ícone como as outras ações do topo', async ({ page, studio }) => {
 const manifestPath = path.join(studio.folder, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frames: Array<Record<string, unknown>> };
 manifest.frames = manifest.frames.map(frame => ({ ...frame, group: 'biblioteca', role: frame.id === 'editorial' ? 'control' : 'variant' }));
 await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
 await page.goto(studio.url);
 const compare = page.getByRole('button', { name: 'Comparar', exact: true });
 await expect(compare).toBeVisible();
 await expect(compare.locator('svg')).toHaveCount(1);
 for (const button of await page.locator('.topbar-end > button').all()) await expect(button.locator('svg')).toHaveCount(1);
});

test('em telas estreitas o atalho Comentar mantém ícone e rótulo', async ({ page, studio }) => {
 await page.setViewportSize({ width: 820, height: 900 });
 await page.goto(studio.url);
 const toggle = page.locator('.feedback-toggle');
 await expect(toggle).toHaveAccessibleName('Comentar');
 const icon = await toggle.locator('svg').boundingBox();
 expect(icon?.width).toBeGreaterThanOrEqual(16);
 await expect(toggle).toContainText('Comentar');
 await toggle.screenshot({ path: path.join(EVIDENCE_DIR, 'polish-feedback-toggle-narrow.png') });
});

test('título do espaço anuncia que abre um diálogo, sem chevron de menu', async ({ page, studio }) => {
 await page.goto(studio.url);
 const title = page.locator('.workspace-title');
 await expect(title).toHaveAccessibleName(/Um espaço para ler/);
 await expect(title).toHaveAttribute('aria-haspopup', 'dialog');
 await expect(title.locator('.lucide-chevron-down')).toHaveCount(0);
 await expect(title.locator('svg')).toHaveCount(1);
 await page.locator('.topbar').screenshot({ path: path.join(EVIDENCE_DIR, 'polish-topbar.png') });
 await title.click();
 await expect(page.getByRole('dialog')).toBeVisible();
});

test('botão de porcentagem volta a 100% e enquadrar continua separado', async ({ page, studio }) => {
 await page.setViewportSize({ width: 1000, height: 800 });
 await page.goto(studio.url);
 const fitButton = page.getByRole('button', { name: 'Centralizar frames', exact: true });
 await fitButton.click();
 const fitted = await zoomLabel(page).textContent();
 expect(fitted).not.toBe('100%');

 await expect(zoomLabel(page)).toHaveAttribute('title', 'Voltar para 100%');
 await expect(zoomLabel(page)).toHaveAccessibleName(`Zoom ${fitted}, voltar para 100%`);
 await zoomLabel(page).click();
 await expect(zoomLabel(page)).toHaveText('100%');
 await expect(zoomLabel(page)).toHaveAccessibleName('Zoom 100%, voltar para 100%');

 await page.getByRole('button', { name: 'Diminuir zoom', exact: true }).click();
 await page.getByRole('button', { name: 'Diminuir zoom', exact: true }).click();
 await zoomLabel(page).click();
 await expect(zoomLabel(page)).toHaveText('100%');

 await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
 await page.keyboard.press('0');
 await expect(zoomLabel(page)).toHaveText(fitted!);
 await zoomLabel(page).click();
 await fitButton.click();
 await expect(zoomLabel(page)).toHaveText(fitted!);
 await page.locator('.toolbar').screenshot({ path: path.join(EVIDENCE_DIR, 'polish-toolbar.png') });
});

test('markdown do info mostra negrito e itálico sem interpretar HTML', async ({ page, studio }) => {
 await writeFile(path.join(studio.folder, 'README.md'), [
  '# Estudo',
  '',
  'Use **Inspecionar** e depois *Comentar*, ou diga: *"Abra o viewer."*',
  '',
  'Conta: 2 * 3 = 6 e um *solto.',
  '',
  '- item com **negrito** e `código`',
  '',
  'Texto <b>cru</b> e <img src=x onerror="window.__xss=1"> fica visível.',
 ].join('\n'));
 await page.goto(studio.url);
 await page.locator('.workspace-title').click();
 const doc = page.getByRole('dialog').locator('.markdown-doc');
 await expect(doc.locator('strong').first()).toHaveText('Inspecionar');
 await expect(doc.locator('em')).toHaveText(['Comentar', '"Abra o viewer."']);
 await expect(doc.locator('li strong')).toHaveText('negrito');
 await expect(doc.locator('li code')).toHaveText('código');
 expect(await doc.locator('li').evaluate(element => getComputedStyle(element).listStyleType)).toBe('disc');
 await expect(doc.getByText('Conta: 2 * 3 = 6 e um *solto.')).toBeVisible();
 await expect(doc.locator('b, img')).toHaveCount(0);
 await expect(doc).toContainText('Texto <b>cru</b> e <img src=x onerror="window.__xss=1"> fica visível.');
 expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
 const paragraphs = await doc.locator('p').allTextContents();
 expect(paragraphs.join('\n')).not.toMatch(/\*\*|\*Comentar\*/);
 await page.getByRole('dialog').screenshot({ path: path.join(EVIDENCE_DIR, 'polish-markdown.png') });
});
