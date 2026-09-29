import { test, expect, startViewer, runCli, copyStudio } from './harness';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('tarball instalado abre o viewer e roda o CLI', async () => {
 test.setTimeout(240_000);
 const pkg = JSON.parse(await readFile('package.json', 'utf8'));
 expect(pkg.private).not.toBe(true);
 expect(pkg.bin.draft).toBe('dist/runtime/cli.js');
 const temp = await mkdtemp(path.join(tmpdir(), 'draft-pack-'));
 try {
  const { stdout } = await exec('npm', ['pack', '--json', '--pack-destination', temp], { maxBuffer: 20 * 1024 * 1024 });
  const packed = JSON.parse(stdout)[0] as { filename: string; files: Array<{ path: string }> };
  const files = packed.files.map(file => file.path);
  expect(files).toContain('dist/runtime/cli.js');
  expect(files).toContain('dist/runtime/mcp.js');
  expect(files).toContain('dist/viewer/bridge.js');
  expect(files).toContain('dist/viewer/index.html');
  expect(files).toContain('examples/studio/experiment.json');
  expect(files.filter(file => /^(src|tests|e2e-evidence)\//.test(file) || file.includes('/.draft'))).toEqual([]);
  const project = path.join(temp, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }));
  await exec('npm', ['install', '--no-audit', '--no-fund', path.join(temp, packed.filename)], { cwd: project, maxBuffer: 20 * 1024 * 1024 });
  const bin = path.join(project, 'node_modules/.bin/draft');
  const example = path.join(project, 'node_modules/draft-viewer/examples/studio');
  const inspected = await exec(bin, ['inspect', example]);
  expect(JSON.parse(inspected.stdout).experiment.frames).toHaveLength(3);
  const folder = await copyStudio();
  const child = spawn(bin, ['open', folder], { env: { ...process.env, DRAFT_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
   const url = await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => { const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.once('exit', code => reject(new Error(`exit ${code}`)));
   });
   expect((await fetch(url)).status).toBe(200);
   const workspace = await (await fetch(`${url}/api/workspace`)).json() as { experiment: { frames: Array<{ url: string }> } };
   const frameUrl = new URL(workspace.experiment.frames[0].url);
   const bridge = await fetch(`${frameUrl.origin}/bridge.js`);
   expect(bridge.status).toBe(200);
   expect(await bridge.text()).toContain('draftroom:goto');
  } finally { child.kill('SIGTERM'); await rm(folder, { recursive: true, force: true }); }
 } finally { await rm(temp, { recursive: true, force: true }); }
});

test('DRAFT_LANG=en troca viewer e CLI para inglês', async ({ page, workspace }) => {
 const viewer = await startViewer(workspace, { DRAFT_LANG: 'en' });
 try {
  await page.goto(viewer.url);
  await expect(page.getByRole('button', { name: 'Inspect', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add prototype', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Comments/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Add prototype', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add prototype' })).toContainText('Create prototype');
 } finally { viewer.process.kill('SIGTERM'); }
 const usage = await runCli(['bogus'], { DRAFT_LANG: 'en' });
 expect(usage.code).not.toBe(0);
 expect(usage.stderr).toContain('Usage:');
 const context = await runCli(['context', workspace], { DRAFT_LANG: 'en' });
 expect(context.json<{ rules: string[] }>().rules[0]).toMatch(/^Before editing a frame/);
});

test('locale do manifesto escolhe o idioma', async ({ page, workspace }) => {
 const manifestPath = path.join(workspace, 'experiment.json');
 await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(await readFile(manifestPath, 'utf8')), locale: 'en' }));
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  await expect(page.getByRole('button', { name: 'Inspect', exact: false })).toBeVisible();
  expect((await runCli(['context', workspace])).json<{ rules: string[] }>().rules[0]).toMatch(/^Before editing a frame/);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('idioma desconhecido cai em pt-BR', async ({ page, workspace }) => {
 const viewer = await startViewer(workspace, { DRAFT_LANG: 'xx-YY' });
 try {
  await page.goto(viewer.url);
  await expect(page.getByRole('button', { name: 'Inspecionar', exact: false })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('body')).not.toContainText(/\b[a-z]+\.[a-z][A-Za-z]+\b/);
 } finally { viewer.process.kill('SIGTERM'); }
});
