import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function teardown() {
 const directory = path.resolve('e2e-evidence');
 const lines = (await readFile(path.join(directory, 'evidence.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean);
 const scenarios = lines.map(line => JSON.parse(line) as { status: string });
 let commit = 'unknown';
 try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
 const summary = {
  generatedAt: new Date().toISOString(),
  commit,
  node: process.version,
  rerun: 'npm ci && npm run build && npm run test:e2e',
  total: scenarios.length,
  passed: scenarios.filter(scenario => scenario.status === 'passed').length,
  failed: scenarios.filter(scenario => scenario.status !== 'passed' && scenario.status !== 'skipped').length,
  scenarios,
 };
 await writeFile(path.join(directory, 'evidence.json'), `${JSON.stringify(summary, null, 2)}\n`);
}
