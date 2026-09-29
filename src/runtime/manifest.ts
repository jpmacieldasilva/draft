import { SCHEMA_VERSION, type Decision, type Edge, type Experiment, type Frame, type FrameRole } from '../protocol.js';
import { RequestError, record } from './workspace.js';

const FRAME_ID = /^[a-zA-Z0-9_-]+$/;
const META_TEXT = 2000;

function validViewport(value: unknown): value is Record<string, unknown> & { width: number; height: number } { return record(value) && typeof value.width === 'number' && typeof value.height === 'number' && value.width >= 160 && value.width <= 4000 && value.height >= 120 && value.height <= 4000; }
function shortText(value: unknown, max: number) { return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined; }

function parseFrameMeta(frame: Record<string, unknown>, diagnostics: string[]): Partial<Frame> {
  const meta: Partial<Frame> = {};
  if (frame.state !== undefined) { const state = shortText(frame.state, 40); if (state) meta.state = state; else diagnostics.push(`Estado inválido ignorado no frame ${String(frame.id)}.`); }
  if (frame.role !== undefined) { if (frame.role === 'control' || frame.role === 'variant') meta.role = frame.role as FrameRole; else diagnostics.push(`Papel inválido ignorado no frame ${String(frame.id)} (use control ou variant).`); }
  if (frame.group !== undefined) { const group = shortText(frame.group, 80); if (group) meta.group = group; }
  const tests = shortText(frame.tests, META_TEXT); if (tests) meta.tests = tests;
  const signal = shortText(frame.signal, 200); if (signal) meta.signal = signal;
  return meta;
}

function parseDecision(value: unknown): Decision | undefined {
  if (!record(value)) return undefined;
  const decision: Decision = {};
  const hypothesis = shortText(value.hypothesis, META_TEXT); if (hypothesis) decision.hypothesis = hypothesis;
  const criteria = shortText(value.criteria, META_TEXT); if (criteria) decision.criteria = criteria;
  return Object.keys(decision).length ? decision : undefined;
}

/** Lenient: invalid edges are dropped with a diagnostic so a hand-edited manifest never stops the viewer from opening. */
function parseEdges(value: unknown, frameIds: Set<string>, diagnostics: string[]): Edge[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { diagnostics.push('edges precisa ser uma lista; arestas ignoradas.'); return []; }
  const edges: Edge[] = []; const seen = new Set<string>();
  for (const item of value.slice(0, 1000)) {
    if (!record(item) || typeof item.from !== 'string' || typeof item.to !== 'string') { diagnostics.push('Aresta inválida ignorada.'); continue; }
    if (!frameIds.has(item.from) || !frameIds.has(item.to)) { diagnostics.push(`Aresta ${item.from} → ${item.to} ignorada: frame inexistente.`); continue; }
    if (item.from === item.to) { diagnostics.push(`Aresta ${item.from} → ${item.to} ignorada: aponta para o próprio frame.`); continue; }
    const key = `${item.from}->${item.to}`;
    if (seen.has(key)) { diagnostics.push(`Aresta duplicada ${item.from} → ${item.to} ignorada.`); continue; }
    seen.add(key);
    edges.push({ from: item.from, to: item.to, label: typeof item.label === 'string' ? item.label.slice(0, 240) : '' });
  }
  return edges;
}

const HOST = /^(\*\.)?(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Only bare hostnames (optionally `*.domain`) are accepted; each becomes `https://host` in the frame CSP. */
function parseAllowNetwork(value: unknown, diagnostics: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { diagnostics.push('allowNetwork precisa ser uma lista de domínios; ignorado.'); return []; }
  const hosts: string[] = [];
  for (const item of value.slice(0, 50)) {
    const host = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (!HOST.test(host)) { diagnostics.push(`allowNetwork: entrada inválida ignorada: ${String(item).slice(0, 120)}`); continue; }
    if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

function controlDiagnostics(frames: Frame[], diagnostics: string[]) {
  const controls = new Map<string, string[]>();
  for (const frame of frames) if (frame.role === 'control') controls.set(frame.group ?? 'default', [...(controls.get(frame.group ?? 'default') ?? []), frame.id]);
  for (const [group, ids] of controls) if (ids.length > 1) diagnostics.push(`Mais de um controle no grupo "${group}": ${ids.join(', ')}.`);
}

export function parseExperiment(value: unknown, diagnostics: string[] = []): Experiment {
  if (!record(value) || !Array.isArray(value.frames)) throw new RequestError('experiment.json precisa conter frames.');
  const seen = new Set<string>();
  const frames: Frame[] = value.frames.map((frame: unknown, index: number) => {
    if (!record(frame) || typeof frame.id !== 'string' || !FRAME_ID.test(frame.id) || seen.has(frame.id)) throw new RequestError(`ID inválido ou repetido no frame ${index + 1}.`);
    seen.add(frame.id);
    return { id: frame.id, title: typeof frame.title === 'string' ? frame.title : frame.id, entry: typeof frame.entry === 'string' ? frame.entry : '', viewport: validViewport(frame.viewport) ? frame.viewport : { width: 960, height: 720 }, ...parseFrameMeta(frame, diagnostics) };
  });
  const schemaVersion = typeof value.schemaVersion === 'number' ? value.schemaVersion : 1;
  if (schemaVersion > SCHEMA_VERSION) diagnostics.push(`Manifesto criado por uma versão mais nova do Draft (schemaVersion ${schemaVersion}); campos desconhecidos são preservados.`);
  controlDiagnostics(frames, diagnostics);
  const decision = parseDecision(value.decision);
  const allowNetwork = parseAllowNetwork(value.allowNetwork, diagnostics);
  const locale = typeof value.locale === 'string' ? value.locale.slice(0, 20) : undefined;
  return { schemaVersion, id: typeof value.id === 'string' ? value.id : 'workspace', title: typeof value.title === 'string' ? value.title : 'Draft', frames, edges: parseEdges(value.edges, seen, diagnostics), ...(decision ? { decision } : {}), ...(allowNetwork.length ? { allowNetwork } : {}), ...(locale ? { locale } : {}) };
}

/** Strict: used for writes coming from the viewer or agents. */
export function validateEdges(value: unknown, frameIds: Set<string>): Edge[] {
  if (!Array.isArray(value) || value.length > 1000) throw new RequestError('Conexões inválidas.');
  const diagnostics: string[] = [];
  const edges = parseEdges(value, frameIds, diagnostics);
  if (diagnostics.length) throw new RequestError(diagnostics[0]);
  for (const item of value) if (record(item) && typeof item.label === 'string' && item.label.length > 240) throw new RequestError('Rótulo de conexão muito longo.');
  return edges;
}

const FRAME_FIELDS = ['state', 'role', 'group', 'tests', 'signal'] as const;

/** Merges parsed values back into the raw manifest so fields Draft does not know survive every write. */
export function serializeManifest(raw: unknown, experiment: Experiment, renamed: Record<string, string> = {}): Record<string, unknown> {
  const source = record(raw) ? raw : {};
  const rawFrames = Array.isArray(source.frames) ? source.frames.filter(record) : [];
  const frames = experiment.frames.map(frame => {
    const original = rawFrames.find(candidate => candidate.id === (renamed[frame.id] ?? frame.id)) ?? {};
    const next: Record<string, unknown> = { ...original, id: frame.id, title: frame.title, entry: frame.entry, viewport: frame.viewport };
    for (const field of FRAME_FIELDS) { if (frame[field] !== undefined) next[field] = frame[field]; else delete next[field]; }
    return next;
  });
  const manifest: Record<string, unknown> = { schemaVersion: Math.max(SCHEMA_VERSION, experiment.schemaVersion), ...source, frames, edges: experiment.edges.map(edge => ({ from: edge.from, to: edge.to, label: edge.label })) };
  manifest.schemaVersion = Math.max(SCHEMA_VERSION, experiment.schemaVersion);
  if (experiment.decision) manifest.decision = { ...(record(source.decision) ? source.decision : {}), ...experiment.decision };
  return manifest;
}
