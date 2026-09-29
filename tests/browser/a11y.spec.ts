import { test, expect, api, region, runCli, startViewer, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/*
 Failure modes covered here:
 - focus lands on <body> after a modal or side panel closes (Escape, close button, scrim);
 - Tab leaves an open modal and reaches the canvas behind it;
 - focus returns to an opener that no longer exists or is hidden;
 - an outside click closes a menu even when clicking inside it, or never closes it;
 - closed menus leak their fields into the accessibility tree;
 - resize arrows move the frame instead of resizing it, or resizing works in read-only;
 - presentation controls rest at 0.55 opacity;
 - chrome text regresses below 4.5:1 or below 11px;
 - disabled buttons show the busy cursor;
 - pins announce only the message, without number and frame.
*/

const activeLabel = (page: Page) => page.evaluate(() => {
 const element = document.activeElement;
 return element === document.body || !element ? 'BODY' : element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName;
});
const focusInside = (page: Page, selector: string) => page.evaluate(selector => !!document.activeElement && document.activeElement !== document.body && !!document.querySelector(selector)?.contains(document.activeElement), selector);
const layout = async (folder: string) => JSON.parse(await readFile(path.join(folder, '.draft/layout.json'), 'utf8').catch(() => '{"frames":{}}')) as { frames: Record<string, { x: number; y: number; width: number; height: number }> };

async function tabStaysInside(page: Page, selector: string, presses = 14) {
 for (let index = 0; index < presses; index++) {
  await page.keyboard.press(index % 5 === 4 ? 'Shift+Tab' : 'Tab');
  expect(await focusInside(page, selector), `Tab ${index + 1} escapou de ${selector}`).toBe(true);
 }
}

test('modais levam o foco para dentro, prendem Tab e devolvem ao abridor', async ({ page, studio }) => {
 const experiment = JSON.parse(await readFile(path.join(studio.folder, 'experiment.json'), 'utf8'));
 experiment.frames[0].role = 'control'; experiment.frames[1].role = 'variant';
 await writeFile(path.join(studio.folder, 'experiment.json'), JSON.stringify(experiment, null, 2));
 await page.goto(studio.url);
 const info = page.getByRole('button', { name: 'Informações de Biblioteca editorial', exact: true });

 await info.focus(); await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await focusInside(page, '[role=dialog]')).toBe(true);
 await tabStaysInside(page, '[role=dialog]');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await activeLabel(page)).toBe('Informações de Biblioteca editorial');

 await info.click();
 await page.getByRole('dialog').getByRole('button', { name: 'Fechar informações' }).click();
 expect(await activeLabel(page)).toBe('Informações de Biblioteca editorial');

 const add = page.getByRole('button', { name: 'Adicionar protótipo', exact: true });
 await add.click();
 await expect(page.getByRole('textbox', { name: 'Nome da alternativa' })).toBeFocused();
 await tabStaysInside(page, '[role=dialog]', 6);
 await page.mouse.click(8, 500);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(add).toBeFocused();

 const compare = page.getByRole('button', { name: 'Comparar', exact: true });
 await expect(compare).toBeVisible();
 await compare.click();
 expect(await focusInside(page, '[role=dialog]')).toBe(true);
 await tabStaysInside(page, '[role=dialog]', 10);
 await page.keyboard.press('Escape');
 await expect(compare).toBeFocused();

 await info.click();
 await page.getByRole('dialog').getByRole('button', { name: 'Apresentar protótipo' }).click();
 await expect(page).toHaveURL(/#frame\/editorial$/);
 expect(await focusInside(page, '.presentation-controls')).toBe(true);
});

test('popover de comentário fecha com Escape e devolve o foco', async ({ page, studio }) => {
 await page.goto(studio.url);
 const toggle = page.locator('.feedback-toggle');
 await toggle.click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 const popover = page.getByRole('dialog', { name: 'Comentário', exact: true });
 await popover.getByRole('button', { name: 'Fechar comentários' }).click();
 await expect(popover).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(toggle).toBeFocused();
});

test('alça de redimensionar responde às setas sem mover o frame', async ({ page, studio }) => {
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Biblioteca editorial', exact: true }).click();
 const handle = page.getByRole('separator', { name: 'Redimensionar Biblioteca editorial' });
 await expect(handle).toHaveAttribute('aria-valuenow', '390');
 await expect(handle).toHaveAttribute('aria-valuetext', '390 × 620 px');
 await handle.focus();
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('Shift+ArrowLeft');
 await page.keyboard.press('ArrowDown');
 await expect(handle).toHaveAttribute('aria-valuetext', '409 × 630 px');
 await expect.poll(async () => (await layout(studio.folder)).frames.editorial?.width).toBe(409);
 const saved = (await layout(studio.folder)).frames.editorial;
 expect(saved).toMatchObject({ x: 0, y: 0, width: 409, height: 630 });
 for (let index = 0; index < 30; index++) await page.keyboard.press('ArrowLeft');
 await expect(handle).toHaveAttribute('aria-valuenow', '160');
});

test('somente leitura não oferece redimensionar e desabilitado não parece ocupado', async ({ page, studio }) => {
 await page.route('**/api/workspace', async route => { const response = await route.fetch(); const json = await response.json(); json.readOnly = true; await route.fulfill({ response, json }); });
 await page.goto(studio.url);
 await expect(page.getByText('Somente leitura')).toBeVisible();
 await expect(page.getByRole('separator')).toHaveCount(0);
 const menu = page.locator('details.viewport-menu').first();
 await menu.locator('summary').click();
 const apply = menu.getByRole('button', { name: 'Aplicar tamanho' });
 await expect(apply).toBeDisabled();
 expect(await apply.evaluate(element => getComputedStyle(element).cursor)).toBe('not-allowed');
});

test('menus fecham ao clicar fora, não dentro, e fechados não expõem campos', async ({ page, studio }) => {
 await page.goto(studio.url);
 await expect(page.getByRole('spinbutton', { name: 'Largura' })).toHaveCount(0);
 await expect(page.getByRole('textbox', { name: 'Novo título' })).toHaveCount(0);
 expect(await page.locator('body').ariaSnapshot()).not.toMatch(/Largura|Novo título/);

 const menu = page.locator('details.frame-menu').first();
 await menu.locator('summary').click();
 await expect(menu).toHaveAttribute('open', '');
 await expect(page.getByRole('textbox', { name: 'Novo título' })).toHaveCount(1);
 await menu.getByRole('textbox').click();
 await expect(menu).toHaveAttribute('open', '');
 await page.mouse.click(700, 900);
 await expect(menu).not.toHaveAttribute('open', '');

 const viewport = page.locator('details.viewport-menu').first();
 await viewport.locator('summary').click();
 await expect(page.getByRole('spinbutton', { name: 'Largura' })).toHaveCount(1);
 await menu.locator('summary').click();
 await expect(viewport).not.toHaveAttribute('open', '');
 await expect(menu).toHaveAttribute('open', '');
 await page.frameLocator('iframe[title="Leitura em movimento"]').locator('body').click({ position: { x: 20, y: 20 } });
 await expect(menu).not.toHaveAttribute('open', '');
});

const contrastOf = (page: Page, selector: string) => page.locator(selector).first().evaluate(element => {
 const parse = (value: string) => {
  const [r, g, b, a = 1] = value.match(/[\d.]+/g)!.map(Number);
  const scale = value.startsWith('color(srgb') ? 255 : 1;
  return { r: r * scale, g: g * scale, b: b * scale, a };
 };
 const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => { const channel = (c: number) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b); };
 const over = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number }) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a) });
 const layers: ReturnType<typeof parse>[] = [];
 for (let node: Element | null = element; node; node = node.parentElement) { const background = parse(getComputedStyle(node).backgroundColor); if (background.a > 0) layers.push(background); }
 const base = layers.reverse().reduce((bottom, top) => over(top, bottom), { r: 255, g: 255, b: 255 });
 let opacity = 1;
 for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
 const style = getComputedStyle(element), color = parse(style.color), text = over({ ...color, a: color.a * opacity }, base);
 const [light, dark] = [luminance(text), luminance(base)].sort((a, b) => b - a);
 return { ratio: Math.round((light + .05) / (dark + .05) * 100) / 100, size: parseFloat(style.fontSize) };
});

test('texto informativo do chrome passa AA e tem ao menos 11px', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Revisar.', target: region() });
 await page.goto(studio.url);
 const results: Record<string, { ratio: number; size: number }> = {};
 for (const selector of ['.viewport-menu>summary', '.minimap>span', '.feedback-toggle span']) results[selector] = await contrastOf(page, selector);
 await page.locator('.feedback-toggle').click();
 for (const selector of ['.comment-kind', '.comment footer>span']) results[selector] = await contrastOf(page, selector);
 await page.keyboard.press('Escape');
 await page.getByRole('button', { name: 'Informações de Biblioteca editorial', exact: true }).click();
 results['.info-sheet .muted'] = await contrastOf(page, '.info-sheet .muted');
 await page.keyboard.press('Escape');
 await page.locator('details.frame-menu').first().locator('summary').click();
 await page.getByRole('button', { name: 'Ocultar do canvas', exact: true }).click();
 results['.hidden-frames>summary'] = await contrastOf(page, '.hidden-frames>summary');
 await writeFile(path.join(EVIDENCE_DIR, 'a11y-contrast.json'), JSON.stringify(results, null, 2));
 for (const [selector, { ratio, size }] of Object.entries(results)) {
  expect(ratio, `${selector} contraste`).toBeGreaterThanOrEqual(4.5);
  expect(size, `${selector} tamanho`).toBeGreaterThanOrEqual(11);
 }
});

test('barra de apresentação começa opaca e repousa legível', async ({ page, studio }) => {
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Apresentar Biblioteca editorial', exact: true }).click();
 const bar = page.locator('.presentation-controls');
 const opacity = () => bar.evaluate(element => Number(getComputedStyle(element).opacity));
 await page.mouse.move(700, 300);
 await expect.poll(opacity).toBe(1);
 await expect.poll(opacity, { timeout: 5000 }).toBeCloseTo(.8, 2);
 await bar.hover();
 await expect.poll(opacity).toBe(1);
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'a11y-presentation-bar.png') });
});

test('pins anunciam número e frame; claim mostra "Agente"', async ({ page, workspace }) => {
 expect((await runCli(['presence', 'claim', workspace, 'editorial', '--ttl', '120'])).code).toBe(0);
 const viewer = await startViewer(workspace);
 try {
  await api(viewer.url, 'feedback', { frameId: 'editorial', message: 'Aumentar o respiro.', target: region() });
  await page.goto(viewer.url);
  await expect(page.getByRole('button', { name: 'Comentário 1 em Biblioteca editorial: Aumentar o respiro.', exact: true })).toBeVisible();
  await expect(page.locator('article[data-frame-id="editorial"] .agent-pill')).toHaveText('Agente');
 } finally { viewer.process.kill('SIGTERM'); }
});
