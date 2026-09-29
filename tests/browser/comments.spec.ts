import { test, expect, api, EVIDENCE_DIR } from './harness';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface Stored { id: string; frameId: string; message: string; status: string; target: { kind: string; label: string; rect: { x: number; y: number; width: number; height: number } } }
const popover = (page: Page) => page.getByRole('dialog', { name: 'Comentário', exact: true });
const pins = (page: Page, frameId: string) => page.locator(`article[data-frame-id="${frameId}"] .pin`);
const element = { kind: 'element', selector: '[data-title="A arte de prestar atenção"]', label: 'A arte de prestar atenção', rect: { x: 20, y: 200, width: 300, height: 120 } };

async function stored(folder: string): Promise<Stored[]> {
 const lines = (await readFile(path.join(folder, '.draft/feedback.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Stored);
 const byId = new Map<string, Stored>();
 for (const line of lines) byId.set(line.id, line);
 return [...byId.values()];
}

async function armComment(page: Page) {
 await page.getByRole('button', { name: 'Comentar', exact: true }).click();
 await expect(page.getByText('Clique no elemento que quer comentar')).toBeVisible();
}

async function clickHeading(page: Page, frameTitle: string) {
 const frame = page.frameLocator(`iframe[title="${frameTitle}"]`);
 await frame.getByRole('heading', { level: 1 }).click();
 await expect(popover(page)).toBeVisible();
}

test('comentário por clique no elemento abre popover e salva', async ({ page, studio }) => {
 await page.goto(studio.url);
 await armComment(page);
 await clickHeading(page, 'Biblioteca editorial');
 await popover(page).getByRole('textbox').fill('Aumentar o respiro.');
 await popover(page).getByRole('button', { name: 'Salvar comentário', exact: true }).click();
 await expect(popover(page)).toHaveCount(0);
 await expect(pins(page, 'editorial')).toHaveText(['1']);
 await pins(page, 'editorial').click();
 await expect(popover(page)).toContainText('Aumentar o respiro.');
 expect((await stored(studio.folder)).some(comment => comment.message === 'Aumentar o respiro.')).toBe(true);
});

test('pin e popover compartilham número e resolver remove o pin', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Primeiro ajuste.', target: element });
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'Segundo ajuste.', target: { ...element, rect: { x: 60, y: 60, width: 80, height: 50 } } });
 await page.goto(studio.url);
 await expect(pins(page, 'editorial')).toHaveText(['1', '2']);
 await pins(page, 'editorial').filter({ hasText: '2' }).click();
 await expect(popover(page)).toContainText('Segundo ajuste.');
 await popover(page).getByRole('button', { name: 'Resolver', exact: true }).click();
 await expect(pins(page, 'editorial')).toHaveText(['1']);
 expect((await stored(studio.folder)).find(comment => comment.message === 'Segundo ajuste.')?.status).toBe('resolved');
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'comments-numbering.png') });
});

test('pin em outro frame foca o protótipo no canvas', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'compact', message: 'Só no compacto.', target: element });
 await page.goto(studio.url);
 await pins(page, 'compact').click();
 await expect(page.locator('article.frame.selected')).toHaveAttribute('data-frame-id', 'compact');
 await expect(popover(page)).toContainText('Só no compacto.');
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'comments-all-frames.png') });
});

test('comentário na apresentação usa popover na barra', async ({ page, studio }) => {
 await api(studio.url, 'feedback', { frameId: 'editorial', message: 'No palco.', target: element });
 await page.goto(`${studio.url}/#frame/editorial`);
 await page.locator('.presentation-controls').getByRole('button', { name: 'Comentar', exact: true }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 await popover(page).getByRole('textbox').fill('Mais contraste.');
 await popover(page).getByRole('button', { name: 'Salvar comentário', exact: true }).click();
 await pins(page, 'editorial').last().click();
 await expect(popover(page)).toContainText('Mais contraste.');
 await page.screenshot({ path: path.join(EVIDENCE_DIR, 'comments-presentation.png') });
});
