import { execFile } from 'node:child_process';

const FRAME_ID = /^[a-zA-Z0-9_-]+$/;
const SHA = /^[0-9a-f]{7,40}$/i;

export interface FrameCommit { sha: string; short: string; date: string; subject: string }

function runGit(root: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_PREFIX;
  return new Promise(resolve => {
    execFile('git', ['-C', root, ...args], { timeout: 15000, maxBuffer: 2_000_000, env }, (error, stdout, stderr) => {
      const status = (error as NodeJS.ErrnoException | null)?.code;
      resolve({ code: typeof status === 'number' ? status : error ? 1 : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

export function commitMessage(frameId: string, detail: string) {
  if (!FRAME_ID.test(frameId)) throw new Error('Frame inválido.');
  const clean = detail.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return `draft(${frameId}): ${clean || 'release'}`;
}

function safePaths(paths: string[]) {
  return [...new Set(paths.map(file => file.replace(/\\/g, '/')).filter(file => file.length > 0 && file.length < 300 && !file.startsWith('/') && !file.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))))];
}

export async function gitAvailable(root: string): Promise<boolean> {
  const result = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  return result.code === 0 && result.stdout.trim() === 'true';
}

export async function commitPaths(root: string, paths: string[], message: string): Promise<boolean> {
  const files = safePaths(paths);
  if (!files.length || !await gitAvailable(root)) return false;
  const added = await runGit(root, ['add', '--', ...files]);
  if (added.code !== 0) throw new Error(added.stderr.trim() || 'git add falhou.');
  const staged = await runGit(root, ['diff', '--cached', '--name-only', '--', ...files]);
  if (!staged.stdout.trim()) return false;
  const configured = await runGit(root, ['config', 'user.name']);
  const identity = configured.stdout.trim() ? [] : ['-c', 'user.name=Draft', '-c', 'user.email=draft@localhost'];
  const result = await runGit(root, [...identity, '-c', 'commit.gpgsign=false', 'commit', '-m', message, '--', ...files]);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'git commit falhou.');
  return true;
}

export async function commitFrame(root: string, frameId: string, message: string) {
  if (!FRAME_ID.test(frameId)) throw new Error('Frame inválido.');
  return commitPaths(root, [`frames/${frameId}`], message);
}

export async function frameLog(root: string, frameId: string): Promise<FrameCommit[] | null> {
  if (!FRAME_ID.test(frameId)) throw new Error('Frame inválido.');
  if (!await gitAvailable(root)) return null;
  const result = await runGit(root, ['log', '-n', '50', '--pretty=format:%H%x1f%h%x1f%aI%x1f%s', '--', `frames/${frameId}`]);
  if (result.code !== 0) return [];
  return result.stdout.split('\n').filter(Boolean).flatMap(line => {
    const [sha, short, date, subject] = line.split('\x1f');
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return [];
    return [{ sha, short: short || sha.slice(0, 7), date: date || '', subject: subject || sha.slice(0, 7) }];
  });
}

async function resolveCommit(root: string, frameId: string, sha: string) {
  if (!SHA.test(sha)) throw new Error('Revisão inválida.');
  const log = await frameLog(root, frameId);
  if (log === null) throw new Error('Esta pasta não é um repositório Git.');
  const match = log.find(commit => commit.sha === sha || commit.sha.startsWith(sha.toLowerCase()));
  if (!match) throw new Error('Essa revisão não altera este frame.');
  return match.sha;
}

export async function framePatch(root: string, frameId: string, sha: string, against?: string) {
  if (!FRAME_ID.test(frameId)) throw new Error('Frame inválido.');
  const target = await resolveCommit(root, frameId, sha);
  const pathspec = `frames/${frameId}`;
  const args = against ? ['diff', '--unified=3', await resolveCommit(root, frameId, against), target, '--', pathspec] : ['show', '--format=', '--unified=3', target, '--', pathspec];
  const result = await runGit(root, args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'git diff falhou.');
  return result.stdout.slice(0, 100_000);
}

export async function restoreFrame(root: string, frameId: string, sha: string) {
  if (!FRAME_ID.test(frameId)) throw new Error('Frame inválido.');
  const target = await resolveCommit(root, frameId, sha);
  const result = await runGit(root, ['checkout', target, '--', `frames/${frameId}`]);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Não foi possível restaurar.');
  return target;
}
