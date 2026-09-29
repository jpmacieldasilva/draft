import { t } from '../i18n';
import { useEffect, useSyncExternalStore, type FormEvent, type PointerEvent, type MouseEvent } from 'react';
import { edgeId, type Connection, type Edge, type Position } from '../protocol';
import { X } from 'lucide-react';
import { snapshot, subscribe, setLayout, framePosition, mutate, addEscapeLayer } from './store';
import { PROTOTYPE_LINKS_UI } from './features';
import './flow-canvas.css';

interface FlowState { open: boolean; source?: string; selected?: string; pending?: Connection; pointer?: { x: number; y: number } }
let flow: FlowState = { open: false };
const listeners = new Set<() => void>();
function flowSnapshot() { return flow; }
function subscribeFlow(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function changeFlow(change: Partial<FlowState>) { flow = { ...flow, ...change }; listeners.forEach(listener => listener()); }
function useFlow() { return useSyncExternalStore(subscribeFlow, flowSnapshot); }
function cancelConnection() {
 if (snapshot().presenting || (!flow.open && !flow.source)) return false;
 changeFlow({ source: undefined, pointer: undefined, open: false });
 return true;
}
function selectConnection(id: string) { if (!snapshot().workspace?.readOnly) changeFlow({ selected: id, open: true, source: undefined }); }
function connections(): Connection[] { return (snapshot().workspace?.experiment.edges ?? []).map(edge => ({ ...edge, id: edgeId(edge) })); }
function saveEdges(edges: Edge[]) { return mutate('edges', { edges: edges.map(({ from, to, label }) => ({ from, to, label })) }); }
function connectFrames(from: string, to: string) {
 if (from === to || snapshot().workspace?.readOnly) return;
 const existing = connections().find(connection => connection.from === from && connection.to === to);
 if (existing) { selectConnection(existing.id); return; }
 const edge = { from, to, label: '' };
 changeFlow({ source: undefined, pointer: undefined, selected: edgeId(edge), pending: { ...edge, id: edgeId(edge) }, open: true });
 void saveEdges([...connections(), edge]);
}
function clickConnector(frameId: string) {
 if (!flow.source) { changeFlow({ source: frameId, selected: undefined, open: true }); return; }
 if (flow.source === frameId) { changeFlow({ source: undefined }); return; }
 connectFrames(flow.source, frameId);
}
function startConnector(event: PointerEvent<HTMLButtonElement>, frameId: string) {
 if (event.button !== 0) return;
 event.stopPropagation();
 const start = { x: event.clientX, y: event.clientY };
 let dragged = false;
 event.currentTarget.setPointerCapture(event.pointerId);
 const move = (current: globalThis.PointerEvent) => {
  if (Math.hypot(current.clientX - start.x, current.clientY - start.y) < 5 && !dragged) return;
  dragged = true;
  const { layout } = snapshot();
  changeFlow({ source: frameId, pointer: { x: (current.clientX - layout.x) / layout.zoom, y: (current.clientY - layout.y) / layout.zoom } });
 };
 const stop = (current: globalThis.PointerEvent) => {
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', stop);
  window.removeEventListener('pointercancel', cancel);
  if (!dragged) { clickConnector(frameId); return; }
  const target = document.elementFromPoint(current.clientX, current.clientY)?.closest('.frame');
  const destination = snapshot().workspace?.experiment.frames.find(frame => frame.id === target?.getAttribute('data-frame-id'));
  changeFlow({ pointer: undefined });
  if (destination && destination.id !== frameId) { connectFrames(frameId, destination.id); return; }
  changeFlow({ source: undefined });
 };
 const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', cancel); changeFlow({ source: undefined, pointer: undefined }); };
 window.addEventListener('pointermove', move);
 window.addEventListener('pointerup', stop);
 window.addEventListener('pointercancel', cancel);
}
export function FrameConnector({ frameId }: { frameId: string }) {
 if (!PROTOTYPE_LINKS_UI) return null;
 const state = useSyncExternalStore(subscribe, snapshot), current = useFlow();
 if (state.workspace?.readOnly || state.presenting) return null;
 return <button className={`frame-connector ${current.source === frameId ? 'connecting' : ''} ${current.source ? 'available' : ''}`} data-frame-connector={frameId} aria-label={current.source && current.source !== frameId ? t('flow.connectHere') : t('flow.create')} title={t('flow.connectorTitle')} onPointerDown={event => startConnector(event, frameId)} onClick={event => { if (event.detail === 0) clickConnector(frameId); }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10m-4-4 4 4-4 4"/></svg></button>;
}
function curve(from: Position, to: Position | { x: number; y: number }) {
 const reverse = to.x < from.x;
 const x1 = from.x + (reverse ? 0 : from.width), y1 = from.y + 44 + from.height / 2;
 const x2 = to.x + ('width' in to && reverse ? to.width : 0), y2 = to.y + ('height' in to ? 44 + to.height / 2 : 0);
 const bend = Math.max(24, Math.abs(x2 - x1) / 2), direction = reverse ? -1 : 1;
 const bow=Math.abs(y2-y1)<30?-40:0;
 return { path: `M ${x1} ${y1} C ${x1 + bend * direction} ${y1+bow}, ${x2 - bend * direction} ${y2+bow}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2+bow*.75 };
}
export function FlowConnections() {
 if (!PROTOTYPE_LINKS_UI) return null;
 const state = useSyncExternalStore(subscribe, snapshot), current = useFlow();
 if (state.presenting) return null;
 return <svg className="flow-connections" aria-label={t('flow.label')}><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 7 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.4"/></marker></defs>{(state.workspace?.experiment.edges ?? []).map(edge => ({ ...edge, id: edgeId(edge) })).map(connection => {
  const from = state.layout.frames[connection.from], to = state.layout.frames[connection.to];
  if (!from || !to || from.hidden || to.hidden) return null;
  const geometry = curve(from, to);
  return <g key={connection.id} className={current.selected === connection.id ? 'flow-selected' : ''}><path className="flow-line" d={geometry.path} markerEnd="url(#flow-arrow)"/><path className="flow-hit" d={geometry.path} onClick={() => selectConnection(connection.id)} aria-label={t('flow.connection',{label:connection.label || t('flow.unlabeled')})} role={state.workspace?.readOnly ? undefined : 'button'} tabIndex={state.workspace?.readOnly ? undefined : 0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectConnection(connection.id); } }}/>{connection.label && <text className="flow-label" x={geometry.x} y={geometry.y - 10} textAnchor="middle" onClick={() => selectConnection(connection.id)}>{connection.label}</text>}</g>;
 })}{current.source && current.pointer && state.layout.frames[current.source] && <path className="flow-line flow-preview" d={curve(state.layout.frames[current.source], current.pointer).path}/>}</svg>;
}
function saveConnection(event: FormEvent<HTMLFormElement>) {
 event.preventDefault();
 const fields = new FormData(event.currentTarget), from = fields.get('from'), to = fields.get('to'), label = fields.get('label');
 if (typeof from !== 'string' || typeof to !== 'string' || typeof label !== 'string' || from === to) return;
 const edge = { from, to, label: label.trim() };
 const others = connections().filter(saved => saved.id !== flow.selected && saved.id !== edgeId(edge));
 void saveEdges([...others, edge]);
 changeFlow({ selected: edgeId(edge), source: undefined, open: false });
}
function removeConnection() { void saveEdges(connections().filter(connection => connection.id !== flow.selected)); changeFlow({ selected: undefined, open: false }); }
export function ConnectionControls() {
 if (!PROTOTYPE_LINKS_UI) return null;
 const state = useSyncExternalStore(subscribe, snapshot), current = useFlow();
 useEffect(() => addEscapeLayer(cancelConnection), []);
 const frames = state.workspace?.experiment.frames.filter(frame => !framePosition(frame).hidden) ?? [];
 const selected = (state.workspace?.experiment.edges ?? []).map(edge => ({ ...edge, id: edgeId(edge) })).find(connection => connection.id === current.selected) ?? (current.pending?.id === current.selected ? current.pending : undefined);
 if (state.presenting || state.workspace?.readOnly) return null;
 return current.open ? <section className="connection-panel" aria-label={t('flow.edit')}><header><strong>{selected ? t('flow.edit') : t('flow.connect')}</strong><button aria-label={t('flow.close')} onClick={() => changeFlow({ open: false, source: undefined })}><X /></button></header><p>{current.source ? t('flow.hintSource') : t('flow.hint')}</p>{frames.length < 2 ? <p>{t('flow.needTwo')}</p> : <form key={`${current.selected ?? 'new'}-${current.source ?? ''}`} onSubmit={saveConnection}><label>{t('flow.from')}<select name="from" defaultValue={selected?.from ?? current.source ?? frames[0]?.id}>{frames.map(frame => <option key={frame.id} value={frame.id}>{frame.title}</option>)}</select></label><label>{t('flow.to')}<select name="to" defaultValue={selected?.to ?? frames.find(frame => frame.id !== (current.source ?? frames[0]?.id))?.id}>{frames.map(frame => <option key={frame.id} value={frame.id}>{frame.title}</option>)}</select></label><label>{t('flow.labelField')}<input name="label" maxLength={160} defaultValue={selected?.label ?? ''} placeholder={t('flow.placeholder')}/></label><footer>{selected && <button type="button" onClick={removeConnection}>{t('flow.remove')}</button>}<button className="primary" type="submit">{selected ? t('flow.save') : t('flow.create')}</button></footer></form>}</section> : null;
}
function centerMap(event: MouseEvent<SVGSVGElement>, left: number, top: number, width: number, height: number) {
 const bounds = event.currentTarget.getBoundingClientRect();
 const { layout } = snapshot();
 setLayout({ ...layout, x: innerWidth / 2 - (left + (event.clientX - bounds.left) / bounds.width * width) * layout.zoom, y: innerHeight / 2 - (top + (event.clientY - bounds.top) / bounds.height * height) * layout.zoom });
}
export function MiniMap() {
 const state = useSyncExternalStore(subscribe, snapshot);
 if (state.presenting || !state.workspace?.experiment.frames.length) return null;
 const positions = state.workspace.experiment.frames.map(framePosition).filter(position => !position.hidden);
 const viewport = { x: -state.layout.x / state.layout.zoom, y: -state.layout.y / state.layout.zoom, width: innerWidth / state.layout.zoom, height: innerHeight / state.layout.zoom };
 const left = Math.min(viewport.x, ...positions.map(position => position.x)) - 100, top = Math.min(viewport.y, ...positions.map(position => position.y)) - 100;
 const width = Math.max(viewport.x + viewport.width, ...positions.map(position => position.x + position.width)) - left + 100;
 const height = Math.max(viewport.y + viewport.height, ...positions.map(position => position.y + position.height + 44)) - top + 100;
 return <aside className="minimap" aria-label={t('minimap.label')}><span>{t('minimap.title')}</span><svg viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio="none" onClick={event => centerMap(event, left, top, width, height)} aria-label={t('minimap.navigate')}>{positions.map((position, index) => <rect key={index} className="minimap-frame" x={position.x} y={position.y} width={position.width} height={position.height + 44}/>)}<rect className="minimap-viewport" x={viewport.x} y={viewport.y} width={viewport.width} height={viewport.height}/></svg></aside>;
}
