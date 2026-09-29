import { test, expect, startViewer } from './harness';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function remoteImage(folder: string, host: string) {
 const file = path.join(folder, 'frames/focus/index.html');
 await writeFile(file, (await readFile(file, 'utf8')).replace('<main>', `<main><img src="https://${host}/pixel.png" alt="remoto" width="10" height="10">`));
}
async function allowNetwork(folder: string, hosts: unknown[]) {
 const file = path.join(folder, 'experiment.json');
 await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), allowNetwork: hosts }, null, 2));
}
async function frameCsp(url: string, frameId: string) {
 const workspace = await (await fetch(`${url}/api/workspace`)).json() as { experiment: { frames: Array<{ id: string; url: string }> } };
 const frame = workspace.experiment.frames.find(candidate => candidate.id === frameId)!;
 return (await fetch(frame.url)).headers.get('content-security-policy') ?? '';
}

test('recurso remoto bloqueado mostra aviso no frame', async ({ page, workspace }) => {
 await remoteImage(workspace, 'cdn.example.invalid');
 const viewer = await startViewer(workspace);
 try {
  await page.goto(viewer.url);
  const warning = page.locator('article[data-frame-id="focus"] .frame-warning');
  await expect(warning).toContainText('cdn.example.invalid');
  await expect(warning).toContainText('allowNetwork');
  await expect(page.locator('article[data-frame-id="editorial"] .frame-warning')).toHaveCount(0);
 } finally { viewer.process.kill('SIGTERM'); }
});

test('allowNetwork recusa entradas perigosas', async ({ page, workspace }) => {
 await allowNetwork(workspace, ['*', 'http://evil.example', 'a b', "'unsafe-eval'", 'data:', '*.example.org', 'fonts.example.com', 42]);
 const viewer = await startViewer(workspace);
 try {
  const csp = await frameCsp(viewer.url, 'editorial');
  expect(csp).toContain('https://fonts.example.com');
  expect(csp).toContain('https://*.example.org');
  expect(csp).not.toContain('evil.example');
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).not.toMatch(/\s\*(\s|;)/);
  expect(csp).not.toMatch(/connect-src[^;]*data:/);
  await page.goto(viewer.url);
  await expect(page.getByRole('alert')).toContainText('allowNetwork');
  await expect(page.getByRole('alert')).toContainText('http://evil.example');
 } finally { viewer.process.kill('SIGTERM'); }
});

test('host liberado entra na CSP e não gera aviso', async ({ page, workspace }) => {
 await remoteImage(workspace, 'cdn.example.invalid');
 await allowNetwork(workspace, ['cdn.example.invalid']);
 const viewer = await startViewer(workspace);
 try {
  const csp = await frameCsp(viewer.url, 'focus');
  for (const directive of ['img-src', 'style-src', 'font-src', 'script-src', 'connect-src', 'media-src']) expect(csp).toMatch(new RegExp(`${directive}[^;]*https://cdn\\.example\\.invalid`));
  await page.goto(viewer.url);
  await expect(page.frameLocator('iframe[title="Um texto por vez"]').getByRole('img', { name: 'remoto' })).toBeAttached();
  await page.waitForTimeout(1500);
  await expect(page.locator('.frame-warning')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
 } finally { viewer.process.kill('SIGTERM'); }
});
