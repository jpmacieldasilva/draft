import { test, expect, runCli, api, CLI } from './harness';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SHOTS = '/opt/cursor/artifacts/screenshots';

async function shot(page: import('@playwright/test').Page, name: string) {
 await mkdir(SHOTS, { recursive: true });
 await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

function git(folder: string, args: string[]) {
 const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
 delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
 return new Promise<string>((resolve, reject) => {
  const child = spawn('git', ['-C', folder, ...args], { env });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`${args.join(' ')} (${code}): ${stderr}`)));
 });
}

async function initRepo(folder: string) {
 await git(folder, ['init']);
 await git(folder, ['config', 'user.email', 'draft@localhost']);
 await git(folder, ['config', 'user.name', 'Draft']);
 await git(folder, ['add', '-A']);
 await git(folder, ['commit', '-m', 'base']);
}

async function connect(folder: string) {
 const client = new Client({ name: 'draft-e2e', version: '1.0.0' });
 await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp', folder], stderr: 'pipe' }));
 const call = async <T = unknown>(name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: Array<{ type: string; text: string }> };
  const text = result.content.map(item => item.text).join('\n');
  return { isError: result.isError === true, text, json: () => JSON.parse(text) as T };
 };
 return { call, close: () => client.close() };
}

const editorial = (page: import('@playwright/test').Page) => page.locator('article[aria-label="Biblioteca editorial"]');

test('claim muda o selo do frame em até 2 segundos', async ({ page, studio }) => {
 await page.goto(studio.url);
 const frame = editorial(page);
 await expect(frame.getByText('Em andamento')).toHaveCount(0);
 expect((await runCli(['presence', 'claim', studio.folder, 'editorial', '--label', 'Agente', '--ttl', '120'])).code).toBe(0);
 await expect(frame.getByText('Em andamento', { exact: true })).toBeVisible({ timeout: 2000 });
 await shot(page, 'status-working');
 expect((await runCli(['presence', 'clear', studio.folder, 'editorial'])).code).toBe(0);
 await expect(frame.getByText('Em andamento', { exact: true })).toHaveCount(0, { timeout: 2000 });
 await expect(frame.getByText('Pronto', { exact: true })).toHaveCount(0);
});

test('ask_user entra na fila e sai quando é respondida', async ({ page, studio }) => {
 await page.goto(studio.url);
 const mcp = await connect(studio.folder);
 try {
  expect((await mcp.call('claim', { frameId: 'editorial', label: 'Agente' })).isError).toBe(false);
  expect((await mcp.call('ask_user', { frameId: 'editorial', question: 'Qual margem você prefere?' })).isError).toBe(false);
  const frame = editorial(page);
  await expect(frame.getByText('Precisa de você', { exact: true })).toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Status dos frames' });
  await expect(panel.getByText('Qual margem você prefere?')).toBeVisible();
  await shot(page, 'status-needs-you');
  await panel.getByRole('textbox', { name: 'Resposta' }).fill('A margem curta.');
  await panel.getByRole('button', { name: 'Responder', exact: true }).click();
  await expect(panel.getByText('Qual margem você prefere?')).toHaveCount(0);
  await expect(frame.getByText('Precisa de você', { exact: true })).toHaveCount(0);
  await expect(frame.getByText('Em andamento', { exact: true })).toBeVisible();
  const context = (await mcp.call<{ questions: Array<{ prompt: string; answer?: string; status: string }> }>('get_context')).json();
  expect(context.questions.find(item => item.prompt === 'Qual margem você prefere?')).toMatchObject({ status: 'answered', answer: 'A margem curta.' });
 } finally { await mcp.close(); }
});

test('salvar no Inspect altera só o HTML do frame e gera um commit', async ({ page, studio }) => {
 await initRepo(studio.folder);
 const file = path.join(studio.folder, 'frames/editorial/index.html');
 const before = await readFile(file, 'utf8');
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 const inspector = page.getByRole('complementary', { name: 'Inspector' });
 await expect(inspector.getByRole('textbox', { name: 'Preenchimento', exact: true })).toBeVisible();
 await expect(inspector.getByRole('textbox', { name: 'Cor da borda', exact: true })).toBeVisible();
 await expect(inspector.getByRole('spinbutton', { name: 'Borda (px)', exact: true })).toBeVisible();
 await expect(inspector.getByRole('spinbutton', { name: 'Espaço interno (px)', exact: true })).toBeVisible();
 await expect(inspector.getByRole('spinbutton', { name: 'Espaço entre (px)', exact: true })).toBeVisible();
 await expect(inspector.getByRole('navigation', { name: 'Arquivo do elemento' })).toContainText('frames/editorial/index.html');
 await inspector.getByRole('spinbutton', { name: 'Espaço interno (px)', exact: true }).fill('18');
 await expect(inspector.getByText('Não salvo', { exact: true })).toBeVisible();
 await shot(page, 'inspect-controls');
 expect(await readFile(file, 'utf8')).toBe(before);
 await inspector.getByRole('button', { name: 'Reset', exact: true }).click();
 await expect(inspector.getByText('Não salvo', { exact: true })).toHaveCount(0);
 await inspector.getByRole('spinbutton', { name: 'Espaço interno (px)', exact: true }).fill('18');
 await inspector.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(inspector.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 expect(await readFile(file, 'utf8')).toContain('padding: 18px');
 expect((await git(studio.folder, ['rev-list', '--count', 'HEAD'])).trim()).toBe('2');
 const stat = (await git(studio.folder, ['diff', '--stat', 'HEAD~1', 'HEAD'])).split('\n').filter(line => line.includes('|')).map(line => line.trim().split(/\s+\|/)[0]);
 expect(stat).toEqual(['frames/editorial/index.html']);
 expect((await git(studio.folder, ['log', '-1', '--format=%s'])).trim()).toBe('draft(editorial): salvar ajuste');
});

test('restaurar original devolve o HTML byte a byte', async ({ page, studio }) => {
 await initRepo(studio.folder);
 const file = path.join(studio.folder, 'frames/editorial/index.html');
 const before = await readFile(file, 'utf8');
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 const inspector = page.getByRole('complementary', { name: 'Inspector' });
 await inspector.getByRole('spinbutton', { name: 'Espaço interno (px)', exact: true }).fill('21');
 await inspector.getByRole('button', { name: 'Salvar ajuste', exact: true }).click();
 await expect(inspector.getByText('Ajuste salvo.', { exact: true })).toBeVisible();
 expect(await readFile(file, 'utf8')).not.toBe(before);
 await inspector.getByRole('button', { name: 'Restaurar original', exact: true }).click();
 await expect.poll(async () => readFile(file, 'utf8')).toBe(before);
});

test('histórico lista só commits do frame e restaurar volta aquela versão', async ({ page, studio }) => {
 await initRepo(studio.folder);
 const editorialFile = path.join(studio.folder, 'frames/editorial/index.html');
 const compactFile = path.join(studio.folder, 'frames/compact/index.html');
 const v1 = await readFile(editorialFile, 'utf8');
 await writeFile(editorialFile, v1.replace('A arte de prestar atenção</h2>', 'A arte de prestar atenção v2</h2>'));
 await git(studio.folder, ['add', 'frames/editorial/index.html']);
 await git(studio.folder, ['commit', '-m', 'editorial v2']);
 await writeFile(compactFile, `${await readFile(compactFile, 'utf8')}\n<!-- compact-only-marker -->\n`);
 await git(studio.folder, ['add', 'frames/compact/index.html']);
 await git(studio.folder, ['commit', '-m', 'compact only']);
 await page.goto(studio.url);
 await page.getByLabel('Opções de Biblioteca editorial').click();
 await page.getByRole('button', { name: 'Histórico', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Histórico do frame' });
 await expect(dialog.getByText('editorial v2')).toBeVisible();
 await expect(dialog.getByText('compact only')).toHaveCount(0);
 await expect(dialog.locator('pre')).toContainText('atenção v2');
 await expect(dialog.locator('pre')).not.toContainText('compact-only-marker');
 await shot(page, 'history');
 const history = await (await fetch(`${studio.url}/api/frames/editorial/history`)).json() as { commits: Array<{ sha: string; subject: string }> };
 expect(history.commits.map(commit => commit.subject)).not.toContain('compact only');
 const base = history.commits.find(commit => commit.subject === 'base');
 expect(base).toBeTruthy();
 expect((await api(studio.url, `frames/editorial/history/${base!.sha}/restore`, {})).status).toBe(200);
 expect(await readFile(editorialFile, 'utf8')).toBe(v1);
 expect(await readFile(compactFile, 'utf8')).toContain('compact-only-marker');
});

test('rejeitar suposição gera comentário e aceitar não', async ({ page, studio }) => {
 await initRepo(studio.folder);
 await page.goto(studio.url);
 const mcp = await connect(studio.folder);
 try {
  expect((await mcp.call('claim', { frameId: 'editorial', label: 'Agente' })).isError).toBe(false);
  expect((await mcp.call('submit_summary', { frameId: 'editorial', summary: 'Ajustei a leitura.', assumptions: ['Usar a margem curta.', 'Esconder o subtítulo.'] })).isError).toBe(false);
  const released = await mcp.call<{ committed: string[] }>('release', { frameId: 'editorial' });
  expect(released.isError, released.text).toBe(false);
  expect(released.json().committed).toEqual(['editorial']);
  expect((await git(studio.folder, ['log', '-1', '--format=%s'])).trim()).toMatch(/^draft\(editorial\): /);
  expect(await git(studio.folder, ['show', '--stat', '--format=', 'HEAD'])).toContain('frames/editorial/summary.json');
  await expect(editorial(page).getByText('Pronto', { exact: true })).toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Status dos frames' });
  await expect(panel.getByText('Ajustei a leitura.')).toBeVisible();
  await shot(page, 'assumptions');
  await panel.locator('li').filter({ hasText: 'Usar a margem curta.' }).getByRole('button', { name: 'Aceitar', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Comentários/ })).toContainText('0');
  await panel.locator('li').filter({ hasText: 'Esconder o subtítulo.' }).getByRole('button', { name: 'Rejeitar', exact: true }).click();
  await expect(page.getByText('Suposição rejeitada: Esconder o subtítulo.')).toBeVisible();
  const open = (await runCli(['feedback', 'list', studio.folder, '--open'])).json<Array<{ message: string }>>();
  expect(open.map(item => item.message)).toEqual(['Suposição rejeitada: Esconder o subtítulo.']);
 } finally { await mcp.close(); }
});

test('pasta sem git mostra aviso e o canvas continua', async ({ page, studio }) => {
 await page.goto(studio.url);
 await expect(page.getByRole('status', { name: /não é um repositório Git/ })).toBeVisible();
 await expect(editorial(page)).toBeVisible();
 await page.getByLabel('Opções de Biblioteca editorial').click();
 await page.getByRole('button', { name: 'Histórico', exact: true }).click();
 await expect(page.getByRole('dialog', { name: 'Histórico do frame' })).toContainText('Sem repositório Git');
 await page.getByRole('button', { name: 'Fechar histórico' }).click();
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await expect(page.getByText('Clique em um elemento para inspecionar.')).toBeVisible();
});

test('claim ativo bloqueia salvar no Inspect', async ({ page, studio }) => {
 const file = path.join(studio.folder, 'frames/editorial/index.html');
 const before = await readFile(file, 'utf8');
 await page.goto(studio.url);
 expect((await runCli(['presence', 'claim', studio.folder, 'editorial', '--label', 'Agente', '--ttl', '120'])).code).toBe(0);
 await page.getByRole('button', { name: 'Inspecionar', exact: false }).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading', { level: 1 }).click();
 await expect(page.getByText('Agent está neste frame. Inspect desabilitado até o claim expirar ou ser liberado.')).toBeVisible();
 const saved = await api(studio.url, 'edits', { frameId: 'editorial', selector: 'h1', styles: { padding: '30px' } });
 expect(saved.status).toBe(409);
 expect(await readFile(file, 'utf8')).toBe(before);
});

test('código é somente leitura e a nota de pesquisa entra no contexto', async ({ page, studio }) => {
 await page.goto(studio.url);
 const frame = editorial(page);
 await frame.getByRole('button', { name: 'Código', exact: true }).click();
 const source = frame.locator('pre.frame-source');
 await expect(source).toContainText('Biblioteca editorial');
 await expect(source.locator('textarea, input')).toHaveCount(0);
 expect(await source.evaluate(element => element instanceof HTMLTextAreaElement || (element as HTMLElement).isContentEditable)).toBe(false);
 await expect(frame.locator('iframe')).toBeHidden();
 await frame.getByRole('button', { name: 'Prévia', exact: true }).click();
 await expect(frame.locator('iframe')).toBeVisible();
 await writeFile(path.join(studio.folder, 'research.md'), '# Notas de pesquisa\n\nHipótese de campo.\n');
 await expect(page.getByRole('complementary', { name: 'Notas de pesquisa' })).toContainText('Hipótese de campo', { timeout: 2000 });
 await shot(page, 'research-note');
 expect((await runCli(['context', studio.folder])).json<{ research: string }>().research).toContain('Hipótese de campo');
});

test('conectar agente mostra o comando de cada cliente', async ({ page, studio }) => {
 await page.goto(studio.url);
 const folder = ((await (await fetch(`${studio.url}/api/workspace`)).json()) as { folder: string }).folder;
 await page.getByRole('button', { name: 'Conectar agente', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Conectar agente' });
 for (const tab of ['Claude Code', 'Cursor', 'Codex', 'Manual']) {
  await dialog.getByRole('tab', { name: tab, exact: true }).click();
  await expect(dialog.getByRole('tabpanel')).toContainText(folder);
  await expect(dialog.getByRole('tabpanel')).toContainText('draft-viewer');
  await expect(dialog.getByRole('tabpanel')).toContainText('mcp');
 }
 await shot(page, 'connect-agent');
});

test('comparar mostra papel e decisão em cada frame', async ({ page, studio }) => {
 const manifestPath = path.join(studio.folder, 'experiment.json');
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
 manifest.schemaVersion = 2;
 manifest.decision = { hypothesis: 'Um texto por vez aumenta leituras concluídas.', criteria: 'Mais leituras concluídas por sessão.' };
 manifest.frames = manifest.frames.map((frame: { id: string }) => ({ ...frame, group: 'biblioteca', ...(frame.id === 'editorial' ? { role: 'control' } : {}), ...(frame.id === 'focus' ? { role: 'variant' } : {}) }));
 await writeFile(manifestPath, JSON.stringify(manifest));
 await page.goto(studio.url);
 await page.getByRole('button', { name: 'Comparar', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Comparar controle e variante' });
 await expect(dialog.locator('iframe[title="Controle: Biblioteca editorial"]')).toBeVisible();
 await expect(dialog.locator('iframe[title="Variante: Um texto por vez"]')).toBeVisible();
 const control = dialog.locator('figure').filter({ has: page.locator('iframe[title="Controle: Biblioteca editorial"]') });
 const variant = dialog.locator('figure').filter({ has: page.locator('iframe[title="Variante: Um texto por vez"]') });
 await expect(control).toContainText('Controle');
 await expect(control).toContainText('Mais leituras concluídas por sessão.');
 await expect(variant).toContainText('Variante');
 await expect(variant).toContainText('Mais leituras concluídas por sessão.');
 await shot(page, 'compare-decision');
});
