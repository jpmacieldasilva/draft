import { test, expect, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import path from 'node:path';

const popover = (page: Page) => page.getByRole('dialog', { name: 'Comentário', exact: true });
const draft = (page: Page) => popover(page).getByRole('textbox');
const modeHint = (page: Page) => page.getByText('Clique no elemento que quer comentar');

async function markElement(page: Page) {
 await page.getByRole('button', { name: 'Biblioteca editorial', exact: true }).click();
 await page.getByRole('button', { name: 'Centralizar frames', exact: true }).click();
 await page.getByRole('button', { name: 'Comentar', exact: true }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 await expect(popover(page)).toBeVisible();
}

test('Escape no rascunho não descarta o texto e remove uma camada por vez', async ({ page, studio }) => {
 await page.goto(studio.url);
 await markElement(page);
 await draft(page).fill('Rascunho que não pode sumir');
 await draft(page).press('Escape');
 await expect(draft(page)).toHaveValue('Rascunho que não pode sumir');
 await expect(popover(page)).toBeVisible();
 await expect(draft(page)).not.toBeFocused();
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'keyboard-escape-draft.png') });
 await page.keyboard.press('Escape');
 await expect(popover(page)).toHaveCount(0);
 await expect(modeHint(page)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(modeHint(page)).toHaveCount(0);
});

test('Escape em campo vazio fecha a camada normalmente', async ({ page, studio }) => {
 await page.goto(studio.url);
 await markElement(page);
 await expect(draft(page)).toBeFocused();
 await draft(page).press('Escape');
 await expect(popover(page)).toHaveCount(0);
 await expect(modeHint(page)).toBeVisible();
});

test('menu do frame fecha antes do popover de comentário', async ({ page, studio }) => {
 await page.goto(studio.url);
 await markElement(page);
 await page.getByLabel('Opções de Biblioteca editorial').click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('textbox', { name: 'Novo título' })).toHaveCount(0);
 await expect(popover(page)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(popover(page)).toHaveCount(0);
});

test('foco retorna ao canvas após fechar comentário', async ({ page, studio }) => {
 await page.goto(studio.url);
 await markElement(page);
 await popover(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
 await expect(popover(page)).toHaveCount(0);
 await page.keyboard.press('Tab');
 await expect(page.locator('.toolbar button.active')).toBeVisible();
});

test('Escape na apresentação fecha camadas na ordem certa', async ({ page, studio }) => {
 await page.goto(`${studio.url}/#frame/editorial`);
 const panel = popover;
 await page.locator('.presentation-controls').getByRole('button', { name: 'Comentar', exact: true }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 await expect(panel(page)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(panel(page)).toHaveCount(0);
 await expect(page).toHaveURL(/#frame\/editorial$/);
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'keyboard-presentation-layer.png') });
 await page.keyboard.press('Escape');
 await expect(page.getByText('Clique no elemento que quer comentar')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(page).not.toHaveURL(/#frame\//);
});

test('Escape vindo do iframe mantém o modo do iframe sincronizado', async ({ page, studio }) => {
 await page.goto(studio.url);
 await markElement(page);
 await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
 const frame = page.frameLocator('iframe[title="Biblioteca editorial"]');
 await frame.locator('body').press('Escape');
 await expect(popover(page)).toHaveCount(0);
 await expect(modeHint(page)).toBeVisible();
 await frame.getByRole('heading', { level: 1 }).click();
 await expect(popover(page)).toBeVisible();
});
