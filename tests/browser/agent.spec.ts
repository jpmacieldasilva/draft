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
 const element = { kind: 'element', selector: '[data-draftroom-id="entrada"]', label: 'Novo item', rect: { x: 20, y: 200, width: 300, height: 40 } };
 const first = await api(url, 'feedback', { frameId: 'base', message: 'Título maior.', target: element });
 const second = await api(url, 'feedback', { frameId: 'launcher', message: 'Menos ruído aqui.', target: region() });
 const ids = (first.body.feedback as FeedbackItem[]).map(item => item.id);
 const all = (second.body.feedback as FeedbackItem[]);
 return { base: ids[0], launcher: all.find(item => item.frameId === 'launcher')!.id };
}

test('context e feedback list entregam só o que está aberto, com seletor e frame', async ({ studio }) => {
 const ids = await seedComments(studio.url);
 expect((await runCli(['feedback', 'resolve', studio.folder, ids.launcher])).code).toBe(0);
 const context = (await runCli(['context', studio.folder])).json<Context>();
 expect(context.workspace.title).toBe('Lista que entende o que você escreve');
 expect(context.feedback.map(item => item.id)).toEqual([ids.base]);
 expect(context.feedback[0]).toMatchObject({ frameId: 'base', message: 'Título maior.', target: { selector: '[data-draftroom-id="entrada"]' } });
 expect(context.frames.find(frame => frame.id === 'base')?.openFeedback).toBe(1);
 expect(context.frames.find(frame => frame.id === 'launcher')?.openFeedback).toBe(0);
 expect(context.rules.join('\n')).toMatch(/draft feedback resolve/);
 const open = (await runCli(['feedback', 'list', studio.folder, '--open'])).json<FeedbackItem[]>();
 expect(open.map(item => item.id)).toEqual([ids.base]);
 const all = (await runCli(['feedback', 'list', studio.folder])).json<FeedbackItem[]>();
 expect(all.map(item => [item.id, item.status])).toEqual([[ids.base, 'open'], [ids.launcher, 'resolved']]);
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
  writes.push(runCli(['feedback', index % 2 ? 'reopen' : 'resolve', studio.folder, ids.base]));
  writes.push(api(studio.url, 'feedback', { frameId: 'mosaico', message: `Comentário concorrente ${index}`, target: region() }));
 }
 await Promise.all(writes);
 const lines = (await readFile(path.join(studio.folder, '.draft/feedback.jsonl'), 'utf8')).trim().split('\n');
 for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
 expect(lines).toHaveLength(2 + 8 + 8);
 const all = (await runCli(['feedback', 'list', studio.folder])).json<FeedbackItem[]>();
 expect(all.filter(item => item.frameId === 'mosaico')).toHaveLength(8);
});

test('context não expõe arquivos privados', async ({ workspace }) => {
 await writeFile(path.join(workspace, 'frames/base/.env'), 'TOKEN=segredo-123');
 await mkdir(path.join(workspace, 'frames/base/node_modules/pkg'), { recursive: true });
 await writeFile(path.join(workspace, 'frames/base/node_modules/pkg/index.html'), '<p>segredo-456</p>');
 await writeFile(path.join(workspace, 'frames/base/notes.txt'), 'segredo-789');
 const result = await runCli(['context', workspace]);
 expect(result.code).toBe(0);
 expect(result.stdout).not.toMatch(/segredo|\.env|node_modules|notes\.txt/);
 const context = result.json<Context>();
 expect(context.frames.find(frame => frame.id === 'base')?.files).toEqual(['frames/base/README.md', 'frames/base/index.html']);
});

test('resolve pelo CLI aparece no viewer aberto', async ({ page, studio }) => {
 const ids = await seedComments(studio.url);
 await page.goto(studio.url);
 await page.getByRole('button', { name: /^Comentários/ }).click();
 await expect(page.getByRole('button', { name: /^Comentários/ })).toContainText('2');
 expect((await runCli(['feedback', 'resolve', studio.folder, ids.base])).code).toBe(0);
 await expect(page.getByRole('button', { name: /^Comentários/ })).toContainText('1');
 await expect(page.locator('.comment', { hasText: 'Título maior.' })).toContainText('Resolvido');
});

test('manifesto inválido faz context falhar com a mensagem exata', async ({ workspace }) => {
 await writeFile(path.join(workspace, 'experiment.json'), JSON.stringify({ frames: [{ id: 'a b' }] }));
 const result = await runCli(['context', workspace]);
 expect(result.code).not.toBe(0);
 expect(result.stderr.trim()).toBe('ID inválido ou repetido no frame 1.');
});

test('context mostra claims ativos por frame', async ({ workspace }) => {
 expect((await runCli(['presence', 'claim', workspace, 'mosaico', '--label', 'Agente de copy', '--ttl', '120'])).code).toBe(0);
 const context = (await runCli(['context', workspace])).json<Context>();
 expect(context.frames.find(frame => frame.id === 'mosaico')?.claimedBy).toBe('Agente de copy');
 expect(context.frames.find(frame => frame.id === 'base')?.claimedBy).toBeUndefined();
 expect(context.presence.map(actor => actor.label)).toEqual(['Agente de copy']);
});
