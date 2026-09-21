import { randomUUID, createHash } from 'node:crypto';
import { readFile, realpath, mkdir, writeFile, rename, appendFile, cp, access, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Experiment, Frame, Feedback, Layout, Target, Workspace, VisualEdit, Connection } from '../protocol.js';
import { applyEdit, captureBaseline, revertBaseline, type EditBaseline } from './prototype-writer.js';

export class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
const ASSETS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav']);
export function publicPath(relative: string): boolean { return !relative.split(/[\\/]/).some(segment => segment.startsWith('.') || ['node_modules', 'reviews'].includes(segment)) && ASSETS.has(path.extname(relative).toLowerCase()) && !['package.json', 'package-lock.json', 'experiment.json'].includes(path.basename(relative)); }
export async function confined(root: string, relative: string): Promise<string> {
  root = await realpath(root);
  if (path.isAbsolute(relative)) throw new RequestError('Caminho inválido.', 403);
  const resolved = await realpath(path.resolve(root, relative));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new RequestError('Arquivo fora do workspace.', 403);
  return resolved;
}
async function optionalText(root: string, relative: string) { try { return await readFile(await confined(root, relative), 'utf8'); } catch { return ''; } }
const STATE_DIR = '.draft';
const LEGACY_STATE_DIR = '.draftroom';
async function readStateFile(root: string, filename: string) { const primary = await optionalText(root, `${STATE_DIR}/${filename}`); return primary || await optionalText(root, `${LEGACY_STATE_DIR}/${filename}`); }
function validViewport(value: unknown): value is Record<string, unknown> & { width: number; height: number } { return record(value) && typeof value.width === 'number' && typeof value.height === 'number' && value.width >= 160 && value.width <= 4000 && value.height >= 120 && value.height <= 4000; }
function parseExperiment(value: unknown): Experiment {
  if (!record(value) || !Array.isArray(value.frames)) throw new RequestError('experiment.json precisa conter frames.');
  const seen = new Set<string>();
  const frames: Frame[] = value.frames.map((frame: unknown, index: number) => {
    if (!record(frame) || typeof frame.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(frame.id) || seen.has(frame.id)) throw new RequestError(`ID inválido ou repetido no frame ${index + 1}.`);
    seen.add(frame.id);
    return { id: frame.id, title: typeof frame.title === 'string' ? frame.title : frame.id, entry: typeof frame.entry === 'string' ? frame.entry : '', viewport: validViewport(frame.viewport) ? frame.viewport : { width: 960, height: 720 } };
  });
  return { id: typeof value.id === 'string' ? value.id : 'workspace', title: typeof value.title === 'string' ? value.title : 'Draft', frames };
}
export interface WorkspaceDiscovery { experiment: Experiment; generated: boolean }
export async function discoverExperiment(root: string): Promise<WorkspaceDiscovery> {
  const resolvedRoot = await realpath(root);
  let manifest: string | undefined;
  try {
    manifest = await confined(resolvedRoot, 'experiment.json');
    await access(manifest);
  } catch (error) {
    if (error instanceof RequestError && error.status === 403) throw error;
    if (!(record(error) && error.code === 'ENOENT')) throw error;
  }
  if (manifest) {
    const source = await readFile(manifest, 'utf8');
    return { experiment: parseExperiment(JSON.parse(source)), generated: false };
  }
  try {
    await confined(resolvedRoot, 'index.html');
    return {
      generated: true,
      experiment: {
        id: path.basename(resolvedRoot).toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'workspace',
        title: path.basename(resolvedRoot) || 'Meu espaço',
        frames: [{ id: 'main', title: 'Protótipo principal', entry: 'index.html', viewport: { width: 960, height: 720 } }],
      },
    };
  } catch {
    throw new RequestError('A pasta precisa conter experiment.json ou index.html.');
  }
}
export async function createWorkspace(folder: string, title = 'Meu espaço'): Promise<string> {
  const destination = path.resolve(folder);
  try { await access(destination); throw new RequestError('A pasta de destino já existe. Escolha outro nome.'); } catch (error) { if (error instanceof RequestError) throw error; }
  await mkdir(path.join(destination, 'frames/main'), { recursive: true });
  await writeFile(path.join(destination, 'experiment.json'), `${JSON.stringify({ id: 'workspace', title, frames: [{ id: 'main', title: 'Primeiro protótipo', entry: 'frames/main/index.html', viewport: { width: 390, height: 620 } }] }, null, 2)}\n`, { flag: 'wx' });
  await writeFile(path.join(destination, 'README.md'), `# ${title}\n\nDescreva aqui o que você está explorando.\n`, { flag: 'wx' });
  await writeFile(path.join(destination, 'frames/main/index.html'), '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Primeiro protótipo</title></head><body><main><h1>Primeiro protótipo</h1><p>Comece a explorar esta ideia.</p></main></body></html>\n', { flag: 'wx' });
  await writeFile(path.join(destination, 'frames/main/README.md'), '# Primeiro protótipo\n\nDescreva a intenção desta alternativa.\n', { flag: 'wx' });
  return realpath(destination);
}
export function validateTarget(value: unknown): Target {
  if (!record(value) || !['element', 'region'].includes(String(value.kind)) || typeof value.label !== 'string' || value.label.length > 500 || !record(value.rect)) throw new RequestError('Alvo inválido.');
  const { x, y, width, height } = value.rect;
  if (![x, y, width, height].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 100000) || typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') throw new RequestError('Geometria inválida.');
  if (value.kind === 'element' && (typeof value.selector !== 'string' || value.selector.length > 2000)) throw new RequestError('Seletor inválido.');
  return { kind: value.kind === 'element' ? 'element' : 'region', label: value.label, selector: typeof value.selector === 'string' ? value.selector : undefined, rect: { x, y, width, height } };
}
function validateLayout(value: unknown): Layout {
  if (!record(value) || !record(value.frames) || typeof value.zoom !== 'number' || value.zoom < 0.05 || value.zoom > 4 || typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new RequestError('Layout inválido.');
  const frames: Layout['frames'] = {};
  for (const [id, position] of Object.entries(value.frames)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !record(position) || !validViewport(position) || typeof position.x !== 'number' || typeof position.y !== 'number' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new RequestError('Posição inválida.');
    frames[id] = { x: position.x, y: position.y, width: position.width, height: position.height, hidden: position.hidden === true };
  }
  const connections:Connection[]=[];
  if(value.connections!==undefined) {
    if(!Array.isArray(value.connections)||value.connections.length>1000)throw new RequestError('Conexões inválidas.');
    const ids=new Set<string>();
    for(const connection of value.connections){
      if(!record(connection)||typeof connection.id!=='string'||connection.id.length>100||ids.has(connection.id)||typeof connection.from!=='string'||typeof connection.to!=='string'||connection.from===connection.to||!frames[connection.from]||!frames[connection.to]||typeof connection.label!=='string'||connection.label.length>240)throw new RequestError('Conexão inválida.');
      ids.add(connection.id);connections.push({id:connection.id,from:connection.from,to:connection.to,label:connection.label});
    }
  }
  return { frames, zoom: value.zoom, x: value.x, y: value.y, connections };
}
const EDIT_PROPERTIES=new Set(['color','backgroundColor','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','gap','borderRadius','width','height','display','textAlign','alignItems','justifyContent']);
function validateEdit(value:unknown):VisualEdit {
  if(!record(value)||typeof value.frameId!=='string'||typeof value.selector!=='string'||!value.selector.trim()||value.selector.length>2000||!record(value.styles))throw new RequestError('Ajuste inválido.');
  const styles:Record<string,string>={};
  for(const [property,entry] of Object.entries(value.styles)){
    if(!EDIT_PROPERTIES.has(property)||typeof entry!=='string'||entry.length>120||/[{};<>\\]/.test(entry)||/url\s*\(|expression|@import/i.test(entry))throw new RequestError('Propriedade visual inválida.');
    styles[property]=entry;
  }
  if(value.text!==undefined&&(typeof value.text!=='string'||value.text.length>10000))throw new RequestError('Texto inválido.');
  return {id:typeof value.id==='string'?value.id:randomUUID(),frameId:value.frameId,selector:value.selector,styles,...(typeof value.text==='string'?{text:value.text}:{})};
}
export class WorkspaceStore {
  token = randomUUID();
  contentOrigin = '';
  private queue: Promise<unknown> = Promise.resolve();
  private migratedEdits = false;
  constructor(public root: string) {}
  async initialize() { this.root = await realpath(this.root); await this.migrateLegacyEdits(); await this.snapshot(); }
  private baselineKey(frameId: string, selector: string) { return `${frameId}:${selector}`; }
  private async loadBaselines(): Promise<Record<string, EditBaseline>> {
    const source = await readStateFile(this.root, 'baselines.json');
    if (!source) return {};
    try { const parsed: unknown = JSON.parse(source); return record(parsed) ? parsed as Record<string, EditBaseline> : {}; } catch { return {}; }
  }
  private async saveBaselines(baselines: Record<string, EditBaseline>) {
    await this.stateDirectory();
    await this.atomic(`${STATE_DIR}/baselines.json`, baselines);
  }
  private async migrateLegacyEdits() {
    if (this.migratedEdits) return;
    this.migratedEdits = true;
    const source = await readStateFile(this.root, 'edits.json');
    if (!source) return;
    let values: unknown;
    try { values = JSON.parse(source); if (!Array.isArray(values)) return; } catch { return; }
    const { experiment } = await discoverExperiment(this.root);
    for (const entry of values) {
      try {
        const edit = validateEdit(entry);
        const frame = experiment.frames.find(candidate => candidate.id === edit.frameId);
        if (frame) await applyEdit(this.root, frame, edit);
      } catch { /* ignore invalid legacy edits */ }
    }
    for (const relative of [`${STATE_DIR}/edits.json`, `${LEGACY_STATE_DIR}/edits.json`]) {
      try { await unlink(await confined(this.root, relative)); } catch { /* already removed */ }
    }
  }
  async snapshot(): Promise<Workspace> {
    this.root = await realpath(this.root);
    await this.migrateLegacyEdits();
    const diagnostics: string[] = [];
    let experiment: Experiment = { id: 'invalid', title: path.basename(this.root), frames: [] };
    try { experiment = (await discoverExperiment(this.root)).experiment; } catch (error) { diagnostics.push(error instanceof Error ? error.message : 'Manifesto inválido.'); }
    for (const frame of experiment.frames) {
      try { if (!publicPath(frame.entry) || path.extname(frame.entry) !== '.html') throw new Error('A entrada precisa ser um HTML público.'); const resolvedEntry = await confined(this.root, frame.entry); if (!publicPath(path.relative(this.root, resolvedEntry))) throw new Error('Entrada privada.'); frame.url = `${this.contentOrigin}/${frame.entry.split('/').map(encodeURIComponent).join('/')}`; } catch { frame.error = 'Não foi possível abrir o HTML deste frame.'; }
      frame.readme = await optionalText(this.root, path.join(path.dirname(frame.entry), 'README.md'));
    }
    const layoutText = await readStateFile(this.root, 'layout.json');
    let layout: Layout | null = null;
    try { if (layoutText) layout = validateLayout(JSON.parse(layoutText)); } catch { diagnostics.push('Layout inválido; composição padrão restaurada.'); }
    const feedback = new Map<string, Feedback>();
    for (const line of (await readStateFile(this.root, 'feedback.jsonl')).split('\n').filter(Boolean)) {
      try { const event: unknown = JSON.parse(line); if (record(event) && typeof event.id === 'string' && typeof event.frameId === 'string' && typeof event.message === 'string' && typeof event.createdAt === 'string' && typeof event.eventId === 'string') feedback.set(event.id, { event: event.event === 'resolved' ? 'resolved' : event.event === 'reopened' ? 'reopened' : 'created', id: event.id, eventId: event.eventId, frameId: event.frameId, message: event.message, createdAt: event.createdAt, status: event.status === 'resolved' ? 'resolved' : 'open', target: validateTarget(event.target) }); } catch { diagnostics.push('Uma linha inválida de feedback foi ignorada.'); }
    }
    return { experiment, readme: await optionalText(this.root, 'README.md'), feedback: [...feedback.values()], layout, revision: createHash('sha256').update(layoutText).digest('hex'), token: this.token, readOnly: false, diagnostics };
  }
  private async stateDirectory() { const directory = path.join(this.root, STATE_DIR); await mkdir(directory, { recursive: true }); if ((await lstat(directory)).isSymbolicLink()) throw new RequestError('A pasta de estado não pode ser um symlink.', 403); return confined(this.root, STATE_DIR); }
  private async atomic(relative: string, value: unknown) { const directory = await confined(this.root, path.dirname(relative)); const destination = path.join(directory, path.basename(relative)); try { await confined(this.root, relative); } catch (error) { if (error instanceof RequestError) throw error; } const temporary = `${destination}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, destination); }
  mutate(operation: () => Promise<void>): Promise<Workspace> { const result = this.queue.then(async () => { this.root = await realpath(this.root); await operation(); return this.snapshot(); }); this.queue = result.catch(() => {}); return result; }
  saveLayout(body: Record<string, unknown>) { return this.mutate(async () => { const workspace = await this.snapshot(); if (body.revision !== workspace.revision) throw new RequestError('A composição mudou. Recarregue antes de salvar.', 409); const layout = validateLayout(body.layout); await this.stateDirectory(); await this.atomic(`${STATE_DIR}/layout.json`, layout); }); }
  saveEdit(body:Record<string,unknown>){return this.mutate(async()=>{
    const workspace=await this.snapshot();
    const frame=workspace.experiment.frames.find(candidate=>candidate.id===body.frameId);
    if(!frame)throw new RequestError('Frame não encontrado.',404);
    const edit=validateEdit({...body,styles:body.styles??{}});
    const key=this.baselineKey(edit.frameId,edit.selector);
    const baselines=await this.loadBaselines();
    if(body.remove===true){
      const baseline=baselines[key];
      if(!baseline)throw new RequestError('Nenhum ajuste salvo para restaurar.',404);
      await revertBaseline(this.root,baseline);
      delete baselines[key];
      await this.saveBaselines(baselines);
      return;
    }
    if(!baselines[key])baselines[key]=await captureBaseline(this.root,frame,edit.selector);
    await applyEdit(this.root,frame,edit);
    await this.saveBaselines(baselines);
  });}
  feedback(body: Record<string, unknown>, id?: string) { return this.mutate(async () => {
    const workspace = await this.snapshot(); const previous = workspace.feedback.find(feedback => feedback.id === id);
    if (id && !previous) throw new RequestError('Comentário não encontrado.', 404);
    if (id && !['open', 'resolved'].includes(String(body.status))) throw new RequestError('Estado inválido.');
    if (!previous && (typeof body.frameId !== 'string' || !workspace.experiment.frames.some(frame => frame.id === body.frameId) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 10000)) throw new RequestError('Comentário inválido.');
    const event: Feedback = previous ? { ...previous, status: body.status === 'resolved' ? 'resolved' : 'open', event: body.status === 'resolved' ? 'resolved' : 'reopened', eventId: randomUUID() } : { id: randomUUID(), eventId: randomUUID(), event: 'created', status: 'open', frameId: String(body.frameId), message: String(body.message).trim(), target: validateTarget(body.target), createdAt: new Date().toISOString() };
    const directory = await this.stateDirectory(); try { await confined(this.root, `${STATE_DIR}/feedback.jsonl`); if ((await lstat(path.join(directory, 'feedback.jsonl'))).isSymbolicLink()) throw new RequestError('O arquivo de feedback não pode ser um symlink.', 403); } catch (error) { if (error instanceof RequestError) throw error; } await appendFile(path.join(directory, 'feedback.jsonl'), `${JSON.stringify(event)}\n`);
  }); }
  changeFrame(id: string, action: string, body: Record<string, unknown>) { return this.mutate(async () => {
    const raw: unknown = JSON.parse(await readFile(await confined(this.root, 'experiment.json'), 'utf8')); const experiment = parseExperiment(raw); let addedFrameId: string | undefined; const frame = experiment.frames.find(frame => frame.id === id); if (!frame) throw new RequestError('Frame não encontrado.', 404);
    if (action === 'rename') { if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) throw new RequestError('Título inválido.'); frame.title = body.title.trim(); }
    if (action === 'duplicate') {
      const source = await confined(this.root, path.dirname(frame.entry)); if (source === this.root || path.dirname(path.dirname(frame.entry)) !== 'frames') throw new RequestError('Duplicação exige uma pasta própria em frames/<id>/.');
      const duplicateId = `${id}-copy-${randomUUID().slice(0, 6)}`; addedFrameId = duplicateId; const parent = await confined(this.root, 'frames'); const destination = path.join(parent, duplicateId); try { await access(destination); throw new RequestError('Destino já existe.'); } catch (error) { if (error instanceof RequestError) throw error; }
      await cp(source, destination, { recursive: true, dereference: false, errorOnExist: true, force: false, filter: async sourcePath => { if ((await lstat(sourcePath)).isSymbolicLink()) throw new RequestError('Duplicação não aceita symlinks.'); await confined(this.root, path.relative(this.root, sourcePath)); return !path.relative(source, sourcePath).split(path.sep).some(segment => segment.startsWith('.')); } });
      experiment.frames.push({ ...frame, id: duplicateId, title: `${frame.title} · cópia`, entry: `frames/${duplicateId}/${path.basename(frame.entry)}` });
    }
    await this.atomic('experiment.json', { ...(record(raw) ? raw : {}), frames: experiment.frames.map(frame => { const original = record(raw) && Array.isArray(raw.frames) ? raw.frames.find((candidate: unknown) => record(candidate) && candidate.id === (frame.id === addedFrameId ? id : frame.id)) : undefined; return { ...(record(original) ? original : {}), ...frame }; }) });
  }); }
  createFrame(title: string) { return this.mutate(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > 200) throw new RequestError('Título inválido.');
    const raw: unknown = JSON.parse(await readFile(await confined(this.root, 'experiment.json'), 'utf8'));
    const experiment = parseExperiment(raw);
    const baseId = trimmedTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'prototipo';
    const usedIds = new Set(experiment.frames.map(frame => frame.id));
    let frameId = baseId;
    let suffix = 2;
    while (usedIds.has(frameId)) frameId = `${baseId}-${suffix++}`;
    const framesDirectory = path.join(this.root, 'frames');
    await mkdir(framesDirectory, { recursive: true });
    await confined(this.root, 'frames');
    const frameDirectory = path.join(framesDirectory, frameId);
    await mkdir(frameDirectory, { recursive: false });
    const entry = `frames/${frameId}/index.html`;
    await writeFile(path.join(frameDirectory, 'index.html'), `<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${trimmedTitle}</title></head><body><main><h1>${trimmedTitle}</h1><p>Comece a explorar esta alternativa.</p></main></body></html>\n`, { flag: 'wx' });
    await writeFile(path.join(frameDirectory, 'README.md'), `# ${trimmedTitle}\n\nDescreva a intenção desta alternativa.\n`, { flag: 'wx' });
    experiment.frames.push({ id: frameId, title: trimmedTitle, entry, viewport: { width: 390, height: 844 } });
    await this.atomic('experiment.json', { ...(record(raw) ? raw : {}), frames: experiment.frames });
  }); }
}
