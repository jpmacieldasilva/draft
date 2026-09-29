import { test as base, expect } from '@playwright/test';
import { mkdtemp, cp, readFile, readdir, rm, mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export const EVIDENCE_DIR = path.resolve('e2e-evidence');
export const CLI = path.resolve('dist/runtime/cli.js');

async function hashTree(root: string, relative = ''): Promise<Record<string, string>> {
 const hashes: Record<string, string> = {};
 let entries;
 try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); } catch { return hashes; }
 for (const entry of entries) {
  const child = path.join(relative, entry.name);
  if (entry.isDirectory()) Object.assign(hashes, await hashTree(root, child));
  else if (entry.isFile() && !entry.name.endsWith('.tmp')) hashes[child.split(path.sep).join('/')] = createHash('sha256').update(await readFile(path.join(root, child))).digest('hex').slice(0, 16);
 }
 return hashes;
}

export async function copyStudio(): Promise<string> {
 const folder = await mkdtemp(path.join(tmpdir(), 'draft-e2e-'));
 await cp('examples/studio', folder, { recursive: true, filter: source => !source.split(path.sep).some(segment => segment === '.draftroom' || segment === '.draft') });
 return folder;
}

export function startViewer(folder: string, env: Record<string, string> = {}): Promise<{ url: string; process: ChildProcess }> {
 const child = spawn(process.execPath, [CLI, 'open', folder], { env: { ...process.env, DRAFT_PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
 return new Promise((resolve, reject) => {
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.stdout?.on('data', (chunk: Buffer) => { const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve({ url: match[0], process: child }); });
  child.once('exit', code => reject(new Error(`Runtime encerrou (${code}): ${stderr}`)));
  child.once('error', reject);
 });
}

export interface CliResult { code: number; stdout: string; stderr: string; json: <T = unknown>() => T }
export function runCli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
 return new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('exit', code => resolve({ code: code ?? 1, stdout, stderr, json: <T,>() => JSON.parse(stdout) as T }));
 });
}

interface Fixtures { workspace: string; studio: { folder: string; url: string; restart: (env?: Record<string, string>) => Promise<string> } }

export const test = base.extend<Fixtures>({
 workspace: async ({}, use, testInfo) => {
  const folder = await copyStudio();
  const before = await hashTree(folder);
  await use(folder);
  const after = await hashTree(folder);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]).sort();
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await appendFile(path.join(EVIDENCE_DIR, 'evidence.jsonl'), `${JSON.stringify({ file: path.basename(testInfo.file), title: testInfo.title, status: testInfo.status, durationMs: testInfo.duration, changed, before, after })}\n`);
  await rm(folder, { recursive: true, force: true });
 },
 studio: async ({ workspace }, use) => {
  let running = await startViewer(workspace);
  const restart = async (env: Record<string, string> = {}) => { running.process.kill('SIGTERM'); running = await startViewer(workspace, env); studio.url = running.url; return running.url; };
  const studio = { folder: workspace, url: running.url, restart };
  await use(studio);
  running.process.kill('SIGTERM');
 },
});

export { expect };
