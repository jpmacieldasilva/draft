import { test, expect, api, region } from './harness';
import type { Page } from '@playwright/test';

const popover = (page: Page) => page.getByRole('dialog', { name: 'Comentário', exact: true });

test('apresentar limpa Inspecionar e a dica de modo', async ({ page, studio }) => {
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Inspecionar', exact: true }).click();
 await expect(page.getByText('Clique em um elemento para inspecionar.')).toBeVisible();
 await page.getByRole('button', { name: 'Apresentar Biblioteca editorial', exact: true }).click();
 await expect(page.locator('.presentation-controls')).toBeVisible();
 await expect(page.getByText('Clique em um elemento para inspecionar.')).toBeHidden();
 await page.keyboard.press('Escape');
 await expect(page.locator('.presentation-controls')).toBeHidden();
});

test('barra de apresentação não tem Tela cheia duplicada', async ({ page, studio }) => {
 await page.goto(`${studio.url}/#frame/editorial`);
 await expect(page.locator('.presentation-controls')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Tela cheia', exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Preencher tela', exact: true })).toBeVisible();
});

test('pin em outro frame abre popover e seleciona o frame', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'compact', message: 'Ir para compacto.', target: region() });
 await page.goto(studio.url);
 await page.locator('article[data-frame-id="compact"] .pin').click();
 await expect(popover(page)).toContainText('Ir para compacto.');
 await expect(page.locator('article.frame.selected')).toHaveAttribute('data-frame-id', 'compact');
});

test('Comentar sai de Inspecionar', async ({ page, studio }) => {
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Inspecionar', exact: true }).click();
 await page.getByRole('button', { name: 'Comentar', exact: true }).click();
 await expect(page.getByText('Clique em um elemento para inspecionar.')).toBeHidden();
 await expect(page.getByText('Clique no elemento que quer comentar')).toBeVisible();
});

test('popover permanece ancorado em viewport estreita', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Teste mobile.', target: region() });
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto(studio.url);
 await page.locator('article[data-frame-id="editorial"] .pin').click();
 const box = await popover(page).boundingBox();
 expect(box).toBeTruthy();
 if (box) expect(box.width).toBeLessThanOrEqual(300);
 await expect(page.locator('.minimap')).toBeVisible();
});
