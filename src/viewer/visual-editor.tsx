import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction, type ChangeEvent } from 'react';
import type { Rect, Target } from '../protocol';
import { t } from '../i18n';
import { activeClaim, iframes, mutate, snapshot, subscribe } from './store';

type Styles = Record<string, string>;
interface EditorState { styles: Styles; changes: Styles; text?: string; changedText?: string; editableText: boolean; ready: boolean; error?: string; saved: boolean }
const EMPTY_STATE: EditorState = { styles: {}, changes: {}, editableText: false, ready: false, saved: false };
const PANEL_WIDTH = 232;
const PAD_SIDES = [['n', 'editor.padTop'], ['e', 'editor.padRight'], ['s', 'editor.padBottom'], ['w', 'editor.padLeft']] as const;
function useStore() { return useSyncExternalStore(subscribe, snapshot); }
function post(frameId: string, message: unknown) { iframes.get(frameId)?.contentWindow?.postMessage(message, '*'); }
function subscribeStyles(frameId: string, target: Target, setState: Dispatch<SetStateAction<EditorState>>) {
 setState(EMPTY_STATE);
 function receive(event: MessageEvent<unknown>) {
  if (event.source !== iframes.get(frameId)?.contentWindow || !event.data || typeof event.data !== 'object') return;
  const message = event.data;
  if (!('type' in message) || message.type !== 'draftroom:styles' || !('selector' in message) || message.selector !== target.selector || !('styles' in message) || !message.styles || typeof message.styles !== 'object') return;
  const styles: Styles = {};
  for (const [name, value] of Object.entries(message.styles)) if (typeof value === 'string') styles[name] = value;
  setState(previous => ({ ...previous, styles, text: 'text' in message && typeof message.text === 'string' ? message.text : undefined, editableText: 'editableText' in message && message.editableText === true, ready: true, error: 'error' in message && typeof message.error === 'string' ? message.error : undefined }));
 }
 window.addEventListener('message', receive);
 post(frameId, { type: 'draftroom:inspect', selector: target.selector });
 return () => { window.removeEventListener('message', receive); post(frameId, { type: 'draftroom:revert' }); };
}
function numericValue(value?: string) { if (!value || !/^[-\d.]+px$/.test(value)) return ''; return parseFloat(value); }
function pixels(value?: string) { const parsed = numericValue(value); return parsed === '' ? 0 : parsed; }
function toHex(value?: string) {
 if (!value) return;
 const hex = value.trim();
 const short = /^#([0-9a-f]{3})$/i.exec(hex);
 if (short) return `#${short[1].split('').map(channel => channel + channel).join('')}`.toLowerCase();
 if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
 const channels = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
 if (!channels || (channels[4] !== undefined && Number(channels[4]) === 0)) return;
 return `#${channels.slice(1, 4).map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}
interface Place { x: number; y: number; width: number; height: number; scale: number; panelLeft: number; panelTop: number }
function anchorBox(frameId: string, rect: Rect) {
 const iframe = iframes.get(frameId);
 if (!iframe) return;
 const box = iframe.getBoundingClientRect();
 if (box.width < 8 || iframe.clientWidth < 8) return;
 const sx = box.width / iframe.clientWidth;
 const sy = box.height / iframe.clientHeight;
 return { x: box.x + rect.x * sx, y: box.y + rect.y * sy, width: Math.max(8, rect.width * sx), height: Math.max(8, rect.height * sy), scale: sx };
}
export function VisualEditor({ frameId, target, onClose }: { frameId: string; target: Target; onClose: () => void }) {
 const store = useStore();
 const [state, setState] = useState<EditorState>(EMPTY_STATE);
 const [dragRect, setDragRect] = useState<Rect | null>(null);
 const panelRef = useRef<HTMLElement>(null);
 const live = useRef(state);
 live.current = state;
 const claim = activeClaim(frameId);
 const anchor = dragRect ?? target.rect;
 const [place, setPlace] = useState<Place>();
 useEffectStyles(frameId, target, claim?.id, setState);
 useLayoutEffect(() => {
  let frame = 0;
  let tries = 0;
  function position() {
   const element = anchorBox(frameId, anchor);
   if (!element || !panelRef.current) {
    if (tries++ < 60) frame = requestAnimationFrame(position);
    return;
   }
   tries = 0;
   const height = panelRef.current.offsetHeight || 180;
   let left = element.x + element.width + 10;
   let top = element.y;
   if (left + PANEL_WIDTH > innerWidth - 12) left = element.x - PANEL_WIDTH - 10;
   if (left < 12) left = Math.max(12, Math.min(element.x, innerWidth - PANEL_WIDTH - 12));
   if (top + height > innerHeight - 12) top = Math.max(72, innerHeight - height - 12);
   if (top < 72) top = 72;
   setPlace({ ...element, panelLeft: left, panelTop: top });
  }
  position();
  window.addEventListener('resize', position);
  return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', position); };
 }, [frameId, anchor.x, anchor.y, anchor.width, anchor.height, store.layout.x, store.layout.y, store.layout.zoom, store.presenting, state.ready, state.editableText, claim?.id]);
 function applyChange(name: string, value: string) {
  const current = live.current;
  const changes = { ...current.changes, [name]: value };
  const next = { ...current, changes, saved: false, error: undefined };
  live.current = next;
  setState(next);
  post(frameId, { type: 'draftroom:preview', selector: target.selector, styles: changes, text: next.changedText });
 }
 function applyText(event: ChangeEvent<HTMLInputElement>) {
  const changedText = event.currentTarget.value;
  const current = live.current;
  const next = { ...current, changedText, saved: false, error: undefined };
  live.current = next;
  setState(next);
  post(frameId, { type: 'draftroom:preview', selector: target.selector, styles: current.changes, text: changedText });
 }
 function reset() { post(frameId, { type: 'draftroom:revert' }); setState({ ...live.current, changes: {}, changedText: undefined, saved: false, error: undefined }); }
 async function save() {
  const current = live.current;
  await mutate('edits', { frameId, selector: target.selector, styles: current.changes, ...(current.changedText === undefined ? {} : { text: current.changedText }) });
  if (snapshot().error) return;
  setState(previous => ({ ...previous, changes: {}, changedText: undefined, saved: true }));
 }
 async function restoreOriginal() {
  await mutate('edits', { frameId, selector: target.selector, remove: true });
  if (!snapshot().error) setState(previous => ({ ...previous, changes: {}, changedText: undefined, saved: false }));
 }
 function beginPad(side: 'n' | 'e' | 's' | 'w', event: ReactPointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  const iframe = iframes.get(frameId);
  const box = iframe?.getBoundingClientRect();
  const scale = box && iframe && iframe.clientWidth ? box.width / iframe.clientWidth : 1;
  const origin = pixels(live.current.changes.padding ?? live.current.styles.padding);
  const startX = event.clientX, startY = event.clientY;
  setDragRect(target.rect);
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (current: PointerEvent) => {
   const delta = side === 'e' ? (current.clientX - startX) / scale : side === 'w' ? (startX - current.clientX) / scale : side === 's' ? (current.clientY - startY) / scale : (startY - current.clientY) / scale;
   applyChange('padding', `${Math.max(0, Math.min(500, Math.round(origin + delta)))}px`);
  };
  const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); setDragRect(null); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
 }
 if (target.kind !== 'element') return null;
 const dirty = Object.keys(state.changes).length > 0 || state.changedText !== undefined;
 const textColor = toHex(state.changes.color ?? state.styles.color);
 const background = toHex(state.changes.backgroundColor ?? state.styles.backgroundColor);
 return <>
  <aside ref={panelRef} className={`inspect-float${claim ? ' is-locked' : ''}`} aria-label={t('inspector.title')} style={place ? { left: place.panelLeft, top: place.panelTop } : { visibility: 'hidden' }}>
   <header><span className="editor-eyebrow">{claim ? t('frame.agent') : t('editor.selected')}</span><strong>{claim ? claim.label : target.label}</strong><button type="button" aria-label={t('inspector.close')} onClick={onClose}>×</button></header>
   {claim && <p className="editor-lock" role="status">{t('editor.locked')}</p>}
   {!claim && !state.ready && <p className="editor-loading" role="status">{t('editor.loading')}</p>}
   {!claim && state.ready && <>
    {state.editableText && <label className="inspect-text">{t('editor.text')}<input aria-label={t('editor.text')} value={state.changedText ?? state.text ?? ''} maxLength={8000} onChange={applyText}/></label>}
    <div className="inspect-row">
     <label>{t('editor.fontSize')} (px)<input type="number" min={1} max={300} step="1" value={numericValue(state.changes.fontSize ?? state.styles.fontSize)} onChange={event => { if (event.currentTarget.value !== '') applyChange('fontSize', `${event.currentTarget.value}px`); }}/></label>
     <label className={`swatch${textColor ? '' : ' is-clear'}`}><span>{t('editor.textColor')}</span><input type="color" value={textColor ?? '#253333'} onChange={event => applyChange('color', event.currentTarget.value)}/></label>
     <label className={`swatch${background ? '' : ' is-clear'}`}><span>{t('editor.backgroundColor')}</span><input type="color" value={background ?? '#ffffff'} onChange={event => applyChange('backgroundColor', event.currentTarget.value)}/></label>
    </div>
    <label>{t('editor.padding')} (px)<input type="number" min={0} max={500} step="1" value={numericValue(state.changes.padding ?? state.styles.padding)} onChange={event => { if (event.currentTarget.value !== '') applyChange('padding', `${event.currentTarget.value}px`); }}/></label>
    {state.error && <p role="alert">{state.error}</p>}
    {dirty && <p className="editor-preview" role="status">{t('editor.preview')}</p>}
    {state.saved && !dirty && <p role="status">{t('editor.saved')}</p>}
    <footer className="inspect-actions"><button type="button" onClick={reset} disabled={!dirty}>{t('editor.undoPreview')}</button><button type="button" className="primary" disabled={store.busy || !!state.error || !dirty} onClick={() => void save()}>{t('editor.save')}</button></footer>
    <button type="button" className="restore-original" onClick={() => void restoreOriginal()}>{t('editor.restore')}</button>
   </>}
  </aside>
  {!claim && state.ready && place && <div className="pad-box" style={{ left: place.x, top: place.y, width: place.width, height: place.height }}>{PAD_SIDES.map(([side, label]) => <button key={side} type="button" className={`pad-handle pad-${side}`} aria-label={t(label)} onPointerDown={event => beginPad(side, event)}/>)}</div>}
 </>;
}
function useEffectStyles(frameId: string, target: Target, claimId: string | undefined, setState: Dispatch<SetStateAction<EditorState>>) {
 useEffect(() => { if (claimId) return; return subscribeStyles(frameId, target, setState); }, [frameId, target.selector, claimId, setState]);
}
