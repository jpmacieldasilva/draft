import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Feedback, PresenceActor } from '../protocol.js';
import { WorkspaceStore, confined, discoverExperiment, publicPath } from './workspace.js';

export interface FeedbackItem { id: string; frameId: string; status: Feedback['status']; message: string; target: Feedback['target']; createdAt: string }

function isContextFile(relative: string) {
  const segments = relative.split('/');
  if (segments.some(segment => segment.startsWith('.') || segment === 'node_modules')) return false;
  return publicPath(relative) || path.extname(relative).toLowerCase() === '.md';
}

async function frameFiles(root: string, entry: string): Promise<string[]> {
  const directory = path.posix.dirname(entry.replace(/\\/g, '/'));
  if (directory === '.' || directory === '') return isContextFile(entry) ? [entry] : [];
  const files: string[] = [];
  async function walk(relative: string) {
    let entries;
    try { entries = await readdir(await confined(root, relative), { withFileTypes: true }); } catch { return; }
    for (const item of entries) {
      const child = `${relative}/${item.name}`;
      if (item.isSymbolicLink() || item.name.startsWith('.') || item.name === 'node_modules') continue;
      if (item.isDirectory()) await walk(child);
      else if (item.isFile() && isContextFile(child)) files.push(child);
    }
  }
  await walk(directory);
  return files.sort();
}

export function feedbackItems(feedback: Feedback[]): FeedbackItem[] {
  return feedback.map(item => ({ id: item.id, frameId: item.frameId, status: item.status, message: item.message, target: item.target, createdAt: item.createdAt }));
}

export function agentRules(folder: string) {
  const quoted = JSON.stringify(folder);
  return [
    `Antes de editar um frame: draft presence claim ${quoted} <frameId> --label <seu nome>. Depois: draft presence clear ${quoted} <frameId>. Não edite frames com claimedBy de outra pessoa.`,
    'Edite apenas arquivos dentro de frames/<frameId>/. Não mova nem renomeie frames; mantenha os ids do experiment.json.',
    'HTML e CSS clássicos, scripts locais sem módulos ES. Sem rede: fetch, CDNs, fontes e imagens remotas são bloqueados pela CSP.',
    'Coloque data-draftroom-id estável nos elementos que recebem comentários ou ajustes do Inspect.',
    `Depois de atender um comentário: draft feedback resolve ${quoted} <id>.`,
    'Não altere .draft/ diretamente: é estado local do viewer.',
    'Estados de fluxo (state), papéis (role: control | variant, por group), decision e edges ficam no experiment.json. Preserve campos que você não conhece.',
  ];
}

export async function buildContext(store: WorkspaceStore) {
  await discoverExperiment(store.root);
  const workspace = await store.snapshot();
  const presence: PresenceActor[] = workspace.presence ?? [];
  const open = workspace.feedback.filter(item => item.status === 'open');
  const frames = await Promise.all(workspace.experiment.frames.map(async frame => {
    const claim = presence.find(actor => actor.frameId === frame.id);
    return {
      id: frame.id, title: frame.title, entry: frame.entry, viewport: frame.viewport,
      ...Object.fromEntries((['state', 'role', 'group', 'tests', 'signal'] as const).filter(field => frame[field] !== undefined).map(field => [field, frame[field]])),
      ...(frame.readme ? { readme: frame.readme } : {}),
      ...(frame.error ? { error: frame.error } : {}),
      files: await frameFiles(store.root, frame.entry),
      openFeedback: open.filter(item => item.frameId === frame.id).length,
      ...(claim ? { claimedBy: claim.label, claimExpiresAt: claim.expiresAt } : {}),
    };
  }));
  return {
    schemaVersion: workspace.experiment.schemaVersion,
    workspace: { id: workspace.experiment.id, title: workspace.experiment.title, readme: workspace.readme },
    ...(workspace.experiment.decision ? { decision: workspace.experiment.decision } : {}),
    frames,
    edges: workspace.experiment.edges,
    feedback: feedbackItems(open),
    presence,
    diagnostics: workspace.diagnostics,
    rules: agentRules(store.root),
  };
}
