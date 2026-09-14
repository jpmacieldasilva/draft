import type { Feedback, Frame, Layout, Position, Target, Workspace } from '../protocol';
declare global { interface Window { __DRAFTROOM__?: Workspace } }
export type Mode = 'interact' | 'element';
interface State { workspace?: Workspace; layout: Layout; mode: Mode; selected?: string; presenting?: string; info?: string; target?: {frameId: string; target: Target}; feedback?: string; error?: string; busy: boolean; comments: boolean; newFrame?: boolean }
const listeners = new Set<() => void>();
let layoutDirty = false;
let layoutRevision = '';
let layoutVersion = 0;
let layoutSaving = false;
let state: State = { layout: { frames: {}, zoom: .65, x: 80, y: 120 }, mode: 'interact', busy: false, comments: false };
export const iframes = new Map<string, HTMLIFrameElement>();
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function snapshot() { return state; }
export function update(change: Partial<State>) { state = {...state, ...change}; listeners.forEach(listener => listener()); }
export function framePosition(frame: Frame): Position { return state.layout.frames[frame.id] ?? {...frame.viewport, x: 0, y: 0}; }
function initialLayout(workspace: Workspace): Layout {
 let x = 0;
 return workspace.layout ?? {zoom: .65, x: 72, y: 130, frames: Object.fromEntries(workspace.experiment.frames.map(frame => { const position = {...frame.viewport, x, y: 0}; x += frame.viewport.width + 64; return [frame.id, position]; }))};
}
export function acceptWorkspace(workspace: Workspace, first = false) {
 if (first || !layoutDirty) layoutRevision = workspace.revision;
 const layout = first || !layoutDirty ? initialLayout(workspace) : state.layout;
 let nextX = Math.max(0, ...Object.values(layout.frames).map(position => position.x + position.width + 64));
 for (const frame of workspace.experiment.frames) { if (!layout.frames[frame.id]) { layout.frames[frame.id] = {...frame.viewport, x: nextX, y: 0}; nextX += frame.viewport.width + 64; } }
 update({workspace, layout, busy: false, error: undefined});
 requestAnimationFrame(()=>iframes.forEach((_iframe,id)=>syncBridge(id)));
 if (first) { readRoute(); if (!workspace.layout) fit(); }
}
export async function discardLayoutConflict() { layoutDirty = false; await refresh(); }
export async function refresh() {
 try { const response = await fetch('./api/workspace'); if (!response.ok) throw new Error('Não foi possível abrir a pasta.'); acceptWorkspace(await response.json(), !state.workspace); }
 catch (error) { update({error: error instanceof Error ? error.message : 'Falha ao carregar workspace.', busy: false}); }
}
export async function mutate(path: string, body: unknown) {
 if (state.workspace?.readOnly) return;
 update({busy: true, error: undefined});
 try {
  const response = await fetch(`./api/${path}`, {method:'POST',headers:{'Content-Type':'application/json','X-Draftroom-Token':state.workspace?.token ?? ''},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Não foi possível salvar.');
  acceptWorkspace(result);
 } catch(error) { update({busy:false,error:error instanceof Error ? error.message : 'Não foi possível salvar.'}); }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function saveLayout() {
 clearTimeout(saveTimer);
 saveTimer = setTimeout(() => { void persistLayout(); }, 220);
}
async function persistLayout() {
 if(layoutSaving || state.workspace?.readOnly) return;
 const version=layoutVersion;
 layoutSaving=true;
 update({busy:true});
 try {
  const response=await fetch('./api/layout',{method:'POST',headers:{'Content-Type':'application/json','X-Draftroom-Token':state.workspace?.token??''},body:JSON.stringify({layout:state.layout,revision:layoutRevision})});
  const result=await response.json();
  if(!response.ok) throw new Error(typeof result.error==='string'?result.error:'Não foi possível salvar a composição.');
  layoutRevision=result.revision;
  layoutDirty=version!==layoutVersion;
  acceptWorkspace(result);
  if(layoutDirty)saveLayout();
 } catch(error) {update({busy:false,error:error instanceof Error?error.message:'Não foi possível salvar a composição.'});}
 finally {layoutSaving=false;}
}
export function setLayout(layout: Layout, save = true) { layoutDirty = true; layoutVersion++; update({layout}); if(save) saveLayout(); }
export function setPosition(frameId: string, position: Position, save = true) { setLayout({...state.layout, frames: {...state.layout.frames, [frameId]:position}}, save); }
export function zoomBy(factor: number) {
 const zoom = Math.min(2, Math.max(.15, state.layout.zoom * factor));
 const cx = innerWidth / 2, cy = innerHeight / 2;
 setLayout({...state.layout, zoom, x: cx - (cx-state.layout.x) * zoom/state.layout.zoom, y:cy-(cy-state.layout.y)*zoom/state.layout.zoom});
}
export function fit() {
 const frames = state.workspace?.experiment.frames.filter(frame => !framePosition(frame).hidden) ?? [];
 if(!frames.length) return;
 const positions = frames.map(framePosition);
 const left = Math.min(...positions.map(p=>p.x)), top = Math.min(...positions.map(p=>p.y));
 const width = Math.max(...positions.map(p=>p.x+p.width))-left;
 const height = Math.max(...positions.map(p=>p.y+p.height+48))-top;
 const zoom = Math.min(1, (innerWidth-128)/width, (innerHeight-220)/height);
 setLayout({...state.layout, zoom:Math.max(.15,zoom), x:(innerWidth-width*zoom)/2-left*zoom, y:120-top*zoom}, false);
}
export function setMode(mode: Mode) { update({mode}); iframes.forEach(iframe => iframe.contentWindow?.postMessage({type:'draftroom:mode', mode}, '*')); }
export function syncBridge(frameId: string) {
 const frame=iframes.get(frameId)?.contentWindow;
 frame?.postMessage({type:'draftroom:mode',mode:state.mode}, '*');
 frame?.postMessage({type:'draftroom:overrides',edits:state.workspace?.edits?.filter(edit=>edit.frameId===frameId)??[]},'*');
}
export function present(frameId: string) { update({presenting:frameId, selected:frameId, info:undefined}); location.hash = `frame/${encodeURIComponent(frameId)}`; }
export function leavePresentation() { update({presenting:undefined}); history.replaceState(null,'',`${location.pathname}${location.search}`); if(document.fullscreenElement) void document.exitFullscreen(); }
export function readRoute() { const id = location.hash.startsWith('#frame/') ? decodeURIComponent(location.hash.slice(7)) : undefined; update({presenting:state.workspace?.experiment.frames.some(frame=>frame.id===id) ? id : undefined}); }
export function selectTarget(frameId:string, target:Target) { update({target:{frameId,target}, selected:frameId, comments:true, feedback:undefined}); }
function isTarget(value: unknown): value is Target {
 if(!value || typeof value !== 'object' || !('kind' in value) || !('rect' in value) || !('label' in value)) return false;
 if(value.kind !== 'element' && value.kind !== 'region' || typeof value.label !== 'string' || value.label.length > 500) return false;
 const rect = value.rect;
 return !!rect && typeof rect === 'object' && ['x','y','width','height'].every(key => { const number = Reflect.get(rect,key); return typeof number === 'number' && Number.isFinite(number) && Math.abs(number)<100000; });
}
function onMessage(event:MessageEvent<unknown>) {
 const frame = [...iframes].find(([,iframe])=>iframe.contentWindow===event.source);
 if(!frame || !event.data || typeof event.data !== 'object' || !('type' in event.data)) return;
 if(event.data.type==='draftroom:ready') syncBridge(frame[0]);
 if(event.data.type==='draftroom:escape') { setMode('interact'); leavePresentation(); }
 if(event.data.type==='draftroom:selection' && 'target' in event.data && isTarget(event.data.target) && state.mode==='element') selectTarget(frame[0],event.data.target);
}
function onKey(event:KeyboardEvent) {
 if(event.key==='Escape') { setMode('interact'); update({target:undefined,info:undefined,comments:false}); leavePresentation(); }
 if(event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable],form')) return;
 if(event.key==='0') fit();
 const frame = state.workspace?.experiment.frames.find(frame => frame.id === state.selected);
 if (frame && event.key === 'Enter') present(frame.id);
 const directions: Record<string, [number,number]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 const direction = directions[event.key];
 if (frame && direction && !state.workspace?.readOnly && !state.presenting) { event.preventDefault(); const position = framePosition(frame); const step = event.shiftKey ? 1 : 10; setPosition(frame.id,{...position,x:position.x+direction[0]*step,y:position.y+direction[1]*step}); }
 if(event.key==='+' || event.key==='=') zoomBy(1.15);
 if(event.key==='-') zoomBy(1/1.15);
}
export function activeFeedback(): Feedback[] { return state.workspace?.feedback ?? []; }
export async function initialize() {
 window.addEventListener('message',onMessage); window.addEventListener('hashchange',readRoute); window.addEventListener('keydown',onKey);
 if(window.__DRAFTROOM__) { acceptWorkspace(window.__DRAFTROOM__,true); return; }
 await refresh();
 const events = new EventSource('./api/events');
 events.onmessage = event => { try { const payload: {type:string;frameIds?:string[]} = JSON.parse(event.data); if(payload.type==='reload') payload.frameIds?.forEach(id => { const iframe=iframes.get(id); if(iframe) { const url=new URL(iframe.src); url.searchParams.set('_reload',String(Date.now())); iframe.src=url.href; } }); if(payload.type==='workspace') void refresh(); } catch { /* Ignore malformed stream messages. */ } };
}
