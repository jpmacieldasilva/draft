import { test, expect, runCli, api, region } from './harness';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

interface FeedbackItem { id: string; frameId: string; status: string; message: string; target: { kind: string; selector?: string; label: string } }
interface Context {
 workspace: { id: string; title: string; readme: string };
 frames: Array<{ id: string; entry: string; files: string[]; openFeedback: number; claimedBy?: string }>;
 feedback: FeedbackItem[];
 presence: Array<{ id: string; label: string; frameId?: string | null }>;
 rules: string[];
}

async function seedComments(url: string) {
 const element = { kind: 'element', selector: '[data-draftroom-id="featured-title"]', label: 'A arte de prestar atenção', rect: { x: 20, y: 200, width: 300, height: 40 } };
 const first = await api(url, 'feedback', { frameId: 'editorial', message: 'Título maior.', target: element });
 const second = await api(url, 'feedback', { frameId: 'compact', message: 'Menos ruído aqui.', target: region() });
 const ids = (first.body.feedback as FeedbackItem[]).map(item => item.id);
 const all = (second.body.feedback as FeedbackItem[]);
 return { editorial: ids[0], compact: all.find(item => item.frameId === 'compact')!.id };
}

test('context e feedback list entregam só o que está aberto, com seletor e frame', async ({ studio }) => {
 const ids = await seedComments(studio.url);
 expect((await runCli(['feedback', 'resolve', studio.folder, ids.compact])).code).toBe(0);
 const context = (await runCli(['context', studio.folder])).json<Context>();
 expect(context.workspace.title).toBe('Um espaço para ler');
 expect(context.feedback.map(item => item.id)).toEqual([ids.editorial]);
 expect(context.feedback[0]).toMatchObject({ frameId: 'editorial', message: 'Título maior.', target: { selector: '[data-draftroom-id="featured-title"]' } });
 expect(context.frames.find(frame => frame.id === 'editorial')?.openFeedback).toBe(1);
 expect(context.frames.find(frame => frame.id === 'compact')?.openFeedback).toBe(0);
 expect(context.rules.join('\n')).toMatch(/draft feedback resolve/);
 const open = (await runCli(['feedback', 'list', studio.folder, '--open'])).json<FeedbackItem[]>();
 expect(open.map(item => item.id)).toEqual([ids.editorial]);
 const all = (await runCli(['feedback', 'list', studio.folder])).json<FeedbackItem[]>();
 expect(all.map(item => [item.id, item.status])).toEqual([[ids.editorial, 'open'], [ids.compact, 'resolved']]);
});

test('resolver id inexistente falha sem tocar no log', async ({ studio }) => {
 await seedComments(studio.url);
 const log = path.join(studio.folder, '.draft/feedback.jsonl');
 const before = await readFile(log, 'utf8');
 const result = await runCli(['feedback', 'resolve', studio.folder, 'nao-existe']);
 expect(result.code).not.toBe(0);
 expect(result.stderr).toContain('Comentário não encontrado');
 expect(await readFile(log, 'utf8')).toBe(before);
});

test('CLI e viewer escrevendo ao mesmo tempo mantêm o log íntegro', async ({ studio }) => {
 const ids = await seedComments(studio.url);
 const writes: Promise<unknown>[] = [];
 for (let index = 0; index < 8; index++) {
  writes.push(runCli(['feedback', index % 2 ? 'reopen' : 'resolve', studio.folder, ids.editorial]));
  writes.push(api(studio.url, 'feedback', { frameId: 'focus', message: `Comentário concorrente ${index}`, target: region() }));
 }
 await Promise.all(writes);
 const lines = (await readFile(path.join(studio.folder, '.draft/feedback.jsonl'), 'utf8')).trim().split('\n');
 for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
 expect(lines).toHaveLength(2 + 8 + 8);
 const all = (await runCli(['feedback', 'list', studio.folder])).json<FeedbackItem[]>();
 expect(all.filter(item => item.frameId === 'focus')).toHaveLength(8);
});

test('context não expõe arquivos privados', async ({ workspace }) => {
 await writeFile(path.join(workspace, 'frames/editorial/.env'), 'TOKEN=segredo-123');
 await mkdir(path.join(workspace, 'frames/editorial/node_modules/pkg'), { recursive: true });
 await writeFile(path.join(workspace, 'frames/editorial/node_modules/pkg/index.html'), '<p>segredo-456</p>');
 await writeFile(path.join(workspace, 'frames/editorial/notes.txt'), 'segredo-789');
 const result = await runCli(['context', workspace]);
 expect(result.code).toBe(0);
 expect(result.stdout).not.toMatch(/segredo|\.env|node_modules|notes\.txt/);
 const context = result.json<Context>();
 expect(context.frames.find(frame => frame.id === 'editorial')?.files).toEqual(['frames/editorial/README.md', 'frames/editorial/index.html']);
});

test('resolve pelo CLI aparece no viewer aberto', async ({ page, studio }) => {
 const ids = await seedComments(studio.url);
 await page.goto(studio.url);
 await expect(page.locator('.pin')).toHaveCount(2);
 expect((await runCli(['feedback', 'resolve', studio.folder, ids.editorial])).code).toBe(0);
 await expect(page.locator('.pin')).toHaveCount(1);
 await page.locator('article[data-frame-id="compact"] .pin').click();
 await expect(page.getByRole('dialog', { name: 'Comentário' })).toContainText('Menos ruído aqui.');
});

test('manifesto inválido faz context falhar com a mensagem exata', async ({ workspace }) => {
 await writeFile(path.join(workspace, 'experiment.json'), JSON.stringify({ frames: [{ id: 'a b' }] }));
 const result = await runCli(['context', workspace]);
 expect(result.code).not.toBe(0);
 expect(result.stderr.trim()).toBe('ID inválido ou repetido no frame 1.');
});

test('context mostra claims ativos por frame', async ({ workspace }) => {
 expect((await runCli(['presence', 'claim', workspace, 'focus', '--label', 'Agente de copy', '--ttl', '120'])).code).toBe(0);
 const context = (await runCli(['context', workspace])).json<Context>();
 expect(context.frames.find(frame => frame.id === 'focus')?.claimedBy).toBe('Agente de copy');
 expect(context.frames.find(frame => frame.id === 'editorial')?.claimedBy).toBeUndefined();
 expect(context.presence.map(actor => actor.label)).toEqual(['Agente de copy']);
});
