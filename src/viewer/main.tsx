import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type PointerEvent, type WheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Hand, MousePointer2, Play, MoreHorizontal, X, Plus, Minus, Maximize, ArrowLeft, MoveDiagonal, Settings } from 'lucide-react';
import { FlowConnections, MiniMap, ConnectionControls, FrameConnector } from './flow-canvas';
import { VisualEditor } from './visual-editor';
import { Button } from '@astryxdesign/core/Button';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './style.css';
import { frameActivity, type Feedback, type Frame, type Layout, type Position, type Target } from '../protocol';
import { t } from '../i18n';
import { subscribe, snapshot, update, initialize, framePosition, iframes, setPosition, saveLayout, setLayout, fit, zoomBy, setMode, present, leavePresentation, syncBridge, mutate, refresh, discardLayoutConflict, activeClaim, nextSteps, followFlow, showCode, openComment } from './store';
import { StatusPanel } from './status-panel';
import { ConnectModal } from './connect-modal';
import { HistoryPanel } from './history-panel';
const PRODUCT_NAME = 'Draft';
function useStore() { return useSyncExternalStore(subscribe,snapshot); }
function startMove(event:PointerEvent<HTMLElement>, frame:Frame, resize = false) {
 if(snapshot().mode==='pan' || snapshot().workspace?.readOnly || snapshot().presenting || event.button!==0 || (event.target instanceof Element && event.target.closest('button,summary,input,select'))) return;
 event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
 const start = {x:event.clientX,y:event.clientY}, position=framePosition(frame), zoom=snapshot().layout.zoom;
 update({selected:frame.id}); document.body.classList.add('dragging');
 const move = (current:globalThis.PointerEvent) => {
  const dx=(current.clientX-start.x)/zoom,dy=(current.clientY-start.y)/zoom;
  const next:Position=resize ? {...position,width:Math.min(4000,Math.max(160,Math.round(position.width+dx))),height:Math.min(4000,Math.max(120,Math.round(position.height+dy)))} : {...position,x:position.x+dx,y:position.y+dy};
  setPosition(frame.id,next,false);
 };
 const stop = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',stop); document.body.classList.remove('dragging'); saveLayout(); };
 window.addEventListener('pointermove',move); window.addEventListener('pointerup',stop,{once:true});
}
function startPan(event:PointerEvent<HTMLElement>) {
 if(event.target!==event.currentTarget || event.button!==0) return;
 event.currentTarget.setPointerCapture(event.pointerId);
 const {layout}=snapshot(), start={x:event.clientX,y:event.clientY};
 const move=(current:globalThis.PointerEvent)=>setLayout({...layout,x:layout.x+current.clientX-start.x,y:layout.y+current.clientY-start.y},false);
 const stop=()=>{window.removeEventListener('pointermove',move);saveLayout();};
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
}
function resizeViewport(event:FormEvent<HTMLFormElement>,frame:Frame) {
 event.preventDefault();const values=new FormData(event.currentTarget);
 const width=Number(values.get('width')),height=Number(values.get('height'));
 if(width>=160&&width<=4000&&height>=120&&height<=4000)setPosition(frame.id,{...framePosition(frame),width,height});
}
function ViewportControls({frame}:{frame:Frame}) {
 const state=useStore(),position=framePosition(frame);
 return <details className="viewport-menu"><summary data-testid="frame-action-viewport" aria-label={t('viewport.label',{title:frame.title})} title={t('viewport.title')}>{position.width} × {position.height}</summary><div className="menu viewport-panel"><strong>{t('viewport.heading')}</strong><form key={`${position.width}:${position.height}`} onSubmit={event=>resizeViewport(event,frame)}><div className="viewport-fields"><label>{t('viewport.width')}<input name="width" type="number" min="160" max="4000" defaultValue={position.width}/></label><label>{t('viewport.height')}<input name="height" type="number" min="120" max="4000" defaultValue={position.height}/></label></div><button type="submit" disabled={state.workspace?.readOnly}>{t('viewport.apply')}</button></form><div className="viewport-presets">{[{label:t('viewport.phone'),width:390,height:844},{label:t('viewport.tablet'),width:768,height:1024},{label:t('viewport.desktop'),width:1440,height:900}].map(preset=><button key={preset.label} disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,width:preset.width,height:preset.height})}>{preset.label}</button>)}</div><button disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,...frame.viewport})}>{t('viewport.reset')}</button></div></details>;
}
function renameFrame(event:FormEvent<HTMLFormElement>, frameId:string) {
 event.preventDefault(); const title=new FormData(event.currentTarget).get('title'); if(typeof title==='string' && title.trim()) void mutate(`frames/${encodeURIComponent(frameId)}/rename`,{title:title.trim()});
}
function submitFeedback(event:FormEvent<HTMLFormElement>) {
 event.preventDefault(); const message=new FormData(event.currentTarget).get('message'),target=snapshot().target;
 if(!target || typeof message!=='string' || !message.trim()) return;
 const text=message.trim();
 void mutate('feedback',{...target,message:text}).then(()=>{
  if(snapshot().error) return;
  const created=[...(snapshot().workspace?.feedback ?? [])].reverse().find(item=>item.frameId===target.frameId && item.message===text && item.status==='open');
  update({target:undefined,feedback:created?.id,selected:target.frameId});
  setMode('interact');
 });
}
function submitReply(event:FormEvent<HTMLFormElement>, comment: Pick<Feedback, 'frameId' | 'target'>) {
 event.preventDefault(); const message=new FormData(event.currentTarget).get('message');
 if(typeof message!=='string' || !message.trim()) return;
 const form=event.currentTarget;
 void mutate('feedback',{frameId:comment.frameId,target:comment.target,message:message.trim()}).then(()=>{ if(!snapshot().error) form.reset(); });
}
function Logo() {
 return <svg className="logo" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 1.2 11.55 8.45 18.8 10 11.55 11.55 10 18.8 8.45 11.55 1.2 10 8.45 8.45Z"/></svg>;
}
function InspectIcon() {
 return <svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M2.6 2.2 2.6 13.2 5.8 10 8.2 14.8 10 13.9 7.6 9.1 11.4 8.8Z"/><path fill="currentColor" d="M12.6 2.6h4.8v4.8h-1.6V5.3l-3.1 3.1-1.1-1.1 3.1-3.1h-2.1V2.6z"/></svg>;
}
function CommentIcon() {
 return <svg viewBox="0 0 20 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M4 3.2h12a1.4 1.4 0 0 1 1.4 1.4v6.6A1.4 1.4 0 0 1 16 12.6H8.4L4.2 16.4V12.6H4A1.4 1.4 0 0 1 2.6 11.2V4.6A1.4 1.4 0 0 1 4 3.2Z"/></svg>;
}
function agentIsConnected(presence: Array<{ expiresAt: string }> | undefined) {
 const now=Date.now();
 return (presence ?? []).some(actor => Date.parse(actor.expiresAt) > now);
}
function onCanvasWheel(event:WheelEvent<HTMLElement>) {
 if(event.ctrlKey || event.metaKey) return;
 const target=event.target;
 const onSurface=target===event.currentTarget || (target instanceof Element && target.classList.contains('pan-layer'));
 if(!onSurface) return;
 const {layout}=snapshot();
 setLayout({...layout,x:layout.x-event.deltaX,y:layout.y-event.deltaY});
}
function NewFrame() {
 const state=useStore(); if(!state.newFrame) return null;
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const title=new FormData(event.currentTarget).get('title');if(typeof title!=='string'||!title.trim())return;void mutate('frames',{title}).then(()=>{if(!snapshot().error)update({newFrame:false});});};
 return <div className="scrim" onClick={()=>update({newFrame:false})}><section role="dialog" aria-modal="true" aria-label={t('app.addPrototype')} className="info-sheet create-sheet" onClick={event=>event.stopPropagation()}><button className="close" aria-label={t('create.close')} onClick={()=>update({newFrame:false})}><X/></button><h1>{t('app.addPrototype')}</h1><form onSubmit={submit} className="create-form"><label>{t('create.name')}<input autoFocus name="title" placeholder={t('create.placeholder')} maxLength={200} required/></label><div className="create-actions"><button type="button" onClick={()=>update({newFrame:false})}>{t('create.cancel')}</button><button className="primary" type="submit" disabled={state.busy}>{t('create.submit')}</button></div></form></section></div>;
}
function FrameSource({frame}:{frame:Frame}) {
 const [content,setContent]=useState(''); const [failed,setFailed]=useState(false);
 useEffect(()=>{ let cancel=false; setFailed(false); void fetch(`./api/frames/${encodeURIComponent(frame.id)}/source`).then(async response=>{ if(!response.ok) throw new Error('source'); return response.json() as Promise<{content:string}>; }).then(body=>{ if(!cancel) setContent(body.content); }).catch(()=>{ if(!cancel) setFailed(true); }); return ()=>{ cancel=true; }; },[frame.id,frame.entry]);
 if(failed) return <p className="frame-error">{t('frame.codeError')}</p>;
 return <pre className="frame-source" tabIndex={0}>{content}</pre>;
}
function RoleChip({ frame }: { frame: Frame }) {
 if (!frame.role) return null;
 return <span className={`frame-role frame-role-${frame.role}`} data-testid="frame-role" title={frame.group ? t('frame.groupTitle', { group: frame.group }) : undefined}>{t(`role.${frame.role}`)}</span>;
}
function FrameState({ frameId, activity }: { frameId: string; activity: ReturnType<typeof frameActivity> }) {
 const label = activity === 'needs-you' ? t('status.needsYou') : activity === 'working' ? t('status.working') : activity === 'ready' ? t('status.ready') : t('status.idle');
 const className = `frame-status frame-status-${activity ?? 'idle'}`;
 return <button type="button" className={className} data-testid="frame-activity" data-activity={activity ?? 'idle'} title={label} aria-label={label} onClick={() => update({ statusOpen: true, selected: frameId, inspector: false })} />;
}
function FrameView({frame}:{frame:Frame}) {
 const state=useStore(), position=framePosition(frame), presenting=state.presenting===frame.id;
 const comments=state.workspace?.feedback.filter(comment=>comment.frameId===frame.id) ?? [];
 const claim = activeClaim(frame.id);
 const activity = state.workspace ? frameActivity(frame.id, state.workspace) : null;
 const showingCode = !!state.code[frame.id];
 return <article className={`frame ${presenting?'presenting':''} ${state.selected===frame.id?'selected':''}${claim?' agent-active':''}`} style={{left:position.x,top:position.y,width:position.width,height:position.height+44,display:position.hidden&&!presenting?'none':undefined}} aria-label={frame.title} data-frame-id={frame.id} title={claim ? t('frame.agentHere') : undefined}>
  <header className="frame-header" data-testid="frame-header" onPointerDown={event=>startMove(event,frame)}>
   <button className="frame-title" data-testid="frame-action-title" onClick={()=>update({selected:frame.id})}>{frame.title}</button>
   <FrameState frameId={frame.id} activity={activity}/>
   <RoleChip frame={frame}/>
   <div className="frame-tools">
    <ViewportControls frame={frame}/>
    <div className="frame-view-toggle" role="group" aria-label={t('frame.view')}><button type="button" aria-pressed={!showingCode} onClick={()=>showCode(frame.id,false)}>{t('frame.preview')}</button><button type="button" aria-pressed={showingCode} onClick={()=>showCode(frame.id,true)}>{t('frame.code')}</button></div>
    <button className="icon-button" data-testid="frame-action-present" aria-label={t('frame.present',{title:frame.title})} title={t('frame.presentTitle')} onClick={()=>present(frame.id)}><Play/></button>
    {!state.workspace?.readOnly&&<details className="frame-menu"><summary data-testid="frame-action-options" aria-label={t('frame.options',{title:frame.title})}><MoreHorizontal/></summary><div className="menu">
     <form onSubmit={event=>renameFrame(event,frame.id)}><label>{t('frame.newTitle')}<input name="title" defaultValue={frame.title} required maxLength={120}/></label><button type="submit" data-testid="frame-action-rename">{t('frame.rename')}</button></form>
     <button data-testid="frame-action-duplicate" onClick={()=>void mutate(`frames/${encodeURIComponent(frame.id)}/duplicate`,{})}>{t('frame.duplicate')}</button>
     <button data-testid="frame-action-hide" onClick={()=>setPosition(frame.id,{...position,hidden:true})}>{t('frame.hide')}</button>
     <button data-testid="frame-action-history" onClick={()=>update({historyFrame:frame.id})}>{t('frame.history')}</button>
    </div></details>}
   </div>
  </header>
  {!!state.blocked[frame.id]?.length&&<p className="frame-warning" role="status">{t('frame.blocked',{hosts:state.blocked[frame.id].join(', ')})}</p>}
  <div className="frame-content">
   {showingCode ? <FrameSource frame={frame}/> : frame.error ? <div className="frame-error"><h2>{t('frame.errorTitle')}</h2><p>{frame.error}</p><button onClick={()=>void refresh()}>{t('app.retry')}</button></div> : <iframe ref={element=>{if(element) iframes.set(frame.id,element);else iframes.delete(frame.id);}} src={frame.url ?? `./content/${frame.entry}`} title={frame.title} sandbox="allow-scripts" onLoad={()=>syncBridge(frame.id)}/>}
   {comments.filter(comment=>comment.status==='open').map((comment,index)=><button key={comment.id} data-comment-id={comment.id} className={`pin ${state.feedback===comment.id?'active':''}`} style={{left:comment.target.rect.x,top:comment.target.rect.y}} title={comment.message} aria-label={t('frame.comment',{n:index+1,message:comment.message})} onClick={()=>openComment(frame.id,comment.id)}>{index+1}</button>)}
   {state.target?.frameId===frame.id&&state.target.target.kind==='region'&&<div className="selection" style={{left:state.target.target.rect.x,top:state.target.target.rect.y,width:state.target.target.rect.width,height:state.target.target.rect.height}}/>}
  </div>
  {!state.workspace?.readOnly&&<div className="resize" title={t('frame.resizeTitle')} role="separator" tabIndex={0} aria-label={t('frame.resize',{title:frame.title})} onPointerDown={event=>startMove(event,frame,true)}><MoveDiagonal/></div>}
  {!state.workspace?.readOnly&&!presenting&&<FrameConnector frameId={frame.id}/>}
 </article>;
}
function NextSteps({frameId}:{frameId:string}) {
 const state=useStore();
 const steps=nextSteps(frameId);
 if(!steps.length) return null;
 return <nav className="presentation-flow" aria-label={t('present.nextSteps')}>{steps.map(edge=><button key={edge.to} onClick={()=>followFlow(edge.to)} title={t('present.goTo',{title:state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title ?? edge.to})}>{edge.label || state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title || edge.to}</button>)}</nav>;
}
function InspectorPanel() {
 const state=useStore();
 if(!state.inspector || state.target?.target.kind!=='element') return null;
 return <aside className="side-panel inspector-panel" aria-label={t('inspector.title')}><header><h2>{t('inspector.title')}</h2><button aria-label={t('inspector.close')} onClick={()=>update({inspector:false,target:undefined})}><X/></button></header>
  <VisualEditor key={`${state.target.frameId}:${state.target.target.selector}`} frameId={state.target.frameId} target={state.target.target}/>
 </aside>;
}
function Comments() {
 const state=useStore(); if(!state.comments) return null;
 const comments=state.workspace?.feedback.filter(comment=>!state.selected||comment.frameId===state.selected) ?? [];
 const openCount=state.workspace?.feedback.filter(comment=>comment.status==='open').length ?? 0;
 return <aside className="side-panel comments-panel" aria-label={t('comments.label')}><header><h2>{t('app.comments')} <span>{openCount}</span></h2><button aria-label={t('comments.close')} onClick={()=>update({comments:false})}><X/></button></header>
  {!comments.length&&<p className="empty-copy">{t('comments.empty')}</p>}
  <div className="comment-list">{comments.map(comment=><button type="button" key={comment.id} className={`comment ${comment.status==='resolved'?'resolved':''} ${state.feedback===comment.id?'focused':''}`} onClick={()=>openComment(comment.frameId,comment.id)}><span className="comment-excerpt">{comment.message}</span><span>{comment.status==='resolved'?t('comments.resolved'):t('comments.open')}</span></button>)}</div>
 </aside>;
}
function popoverAnchor(presenting: boolean, layout: Layout, position: Position, rect: Target['rect']) {
 const x = presenting ? rect.x + 16 : layout.x + (position.x + rect.x) * layout.zoom + 18;
 const y = presenting ? rect.y : layout.y + (position.y + 44 + rect.y) * layout.zoom;
 const width = 280;
 return { left: Math.min(Math.max(12, x), window.innerWidth - width - 12), top: Math.min(Math.max(76, y), Math.max(76, window.innerHeight - 280)), width };
}
function CommentPopover() {
 const state=useStore(); const workspace=state.workspace;
 if(!workspace) return null;
 const comment=state.feedback ? workspace.feedback.find(item=>item.id===state.feedback) : undefined;
 const compose=!comment && state.target?.target.kind==='region' ? state.target : undefined;
 const frameId=comment?.frameId ?? compose?.frameId;
 const rect=comment?.target.rect ?? compose?.target.rect;
 if(!frameId || !rect) return null;
 const frame=workspace.experiment.frames.find(item=>item.id===frameId);
 if(!frame) return null;
 const presenting=state.presenting===frame.id;
 const place=popoverAnchor(presenting, state.layout, framePosition(frame), rect);
 return <div role="dialog" aria-label={t('comments.thread')} className="comment-popover" style={place}>
  {comment ? <>
   <p className="comment-author">{t('comments.author')}</p>
   <p>{comment.message}</p>
   {!workspace.readOnly && <form onSubmit={event=>submitReply(event, comment)}><label>{t('comments.reply')}<textarea name="message" required maxLength={8000} placeholder={t('comments.placeholder')}/></label><div className="popover-actions"><button type="submit" disabled={state.busy}>{t('comments.replySend')}</button><button type="button" onClick={()=>void mutate(`feedback/${encodeURIComponent(comment.id)}`,{status:comment.status==='open'?'resolved':'open'})}>{comment.status==='open'?t('comments.resolve'):t('comments.reopen')}</button></div></form>}
  </> : <form onSubmit={submitFeedback} className="comment-compose"><strong>{compose!.target.label}</strong><code>{Math.round(compose!.target.rect.width)} × {Math.round(compose!.target.rect.height)} px</code><label>{t('comments.prompt')}<textarea autoFocus name="message" required maxLength={8000} placeholder={t('comments.placeholder')}/></label><button className="primary" disabled={state.busy} type="submit">{t('comments.save')}</button></form>}
 </div>;
}
function SettingsMenu({ openCount, readOnly, folder }: { openCount: number; readOnly: boolean; folder?: string }) {
 const state=useStore();
 const root=useRef<HTMLDivElement>(null);
 useEffect(() => {
  if (!state.settingsOpen) return;
  const close = (event: globalThis.PointerEvent) => { if (root.current?.contains(event.target as Node)) return; update({ settingsOpen: false }); };
  const id = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
  return () => { window.clearTimeout(id); window.removeEventListener('pointerdown', close); };
 }, [state.settingsOpen]);
 return <div className="settings" ref={root}><button type="button" aria-label={t('settings.open')} aria-haspopup="menu" aria-expanded={state.settingsOpen} onClick={() => update({ settingsOpen: !snapshot().settingsOpen })}><Settings/></button>
  {state.settingsOpen && <div role="menu" className="menu settings-menu" aria-label={t('settings.open')}>
   {!readOnly && folder && <button type="button" role="menuitem" onClick={() => update({ connectOpen: true, settingsOpen: false })}>{t('connect.open')}</button>}
   <button type="button" role="menuitem" onClick={() => update({ comments: true, inspector: false, settingsOpen: false })}>{t('app.comments')} <span>{openCount}</span></button>
  </div>}
 </div>;
}
function App() {
 const state=useStore(),workspace=state.workspace;
 if(!workspace) return <main className="loading"><span className="brand">{PRODUCT_NAME}<span>✳</span></span><p>{state.error ?? t('app.loading')}</p>{state.error&&<Button label={t('app.retry')} onClick={()=>void refresh()}/>}</main>;
 const hidden=workspace.experiment.frames.filter(frame=>framePosition(frame).hidden);
 const connected=agentIsConnected(workspace.presence);
 const openCount=workspace.feedback.filter(comment=>comment.status==='open').length;
 return <main className={state.presenting?'app is-presenting':'app'}>
  <header className="topbar"><div className="identity"><Logo/><span className="workspace-title">{workspace.experiment.title}</span>{!workspace.readOnly&&workspace.git===false&&<span className="git-pill" role="status" aria-label={t('git.missing')}>{t('git.short')}</span>}<span className="save-state" role="status">{workspace.readOnly?t('app.readOnly'):state.busy?t('app.saving'):''}</span></div><div className="topbar-end">{!workspace.readOnly&&!connected&&workspace.folder&&<button className="connect-secondary" onClick={()=>update({connectOpen:true})}>{t('connect.open')}</button>}{!workspace.readOnly&&<button className="add-frame" onClick={()=>update({newFrame:true})}><Plus/>{t('app.addPrototype')}</button>}<SettingsMenu openCount={openCount} readOnly={workspace.readOnly} folder={workspace.folder}/></div></header>
  <div className="canvas" style={{backgroundSize:`${24*state.layout.zoom}px ${24*state.layout.zoom}px`,backgroundPosition:`${state.layout.x}px ${state.layout.y}px`}} onPointerDown={startPan} onWheel={onCanvasWheel}>
   <div className="world" style={{transform:state.presenting?'none':`translate(${state.layout.x}px,${state.layout.y}px) scale(${state.layout.zoom})`}}><FlowConnections/>{workspace.experiment.frames.map(frame=><FrameView key={frame.id} frame={frame}/>)}</div>
   {state.mode==='pan'&&!state.presenting&&<div className="pan-layer" onPointerDown={startPan}/>}
   {workspace.experiment.frames.length===0&&<div className="empty-canvas"><h1>{t('app.emptyTitle')}</h1><p>{t('app.emptyBody')}</p></div>}
  </div>
  <nav className="toolbar" aria-label={t('toolbar.label')}><button className={state.mode==='pan'?'active':''} aria-label={t('toolbar.pan')} title={t('toolbar.panTitle')} onClick={()=>setMode('pan')} aria-pressed={state.mode==='pan'}><Hand/></button><button className={state.mode==='interact'?'active':''} aria-label={t('toolbar.interact')} title={t('toolbar.interactTitle')} onClick={()=>setMode('interact')} aria-pressed={state.mode==='interact'}><MousePointer2/></button>{!workspace.readOnly&&<><button className={state.mode==='element'?'active':''} aria-label={t('toolbar.inspect')} title={t('toolbar.inspectTitle')} onClick={()=>setMode('element')} aria-pressed={state.mode==='element'}><InspectIcon/></button><button className={state.mode==='comment'?'active':''} aria-label={t('toolbar.comment')} title={t('toolbar.commentTitle')} onClick={()=>setMode('comment')} aria-pressed={state.mode==='comment'}><CommentIcon/></button></>}<span className="divider"/><button aria-label={t('toolbar.zoomOut')} title={t('toolbar.zoomOut')} onClick={()=>zoomBy(1/1.15)}><Minus/></button><button className="zoom" aria-label={t('toolbar.fit')} title={t('toolbar.fitTitle')} onClick={fit}>{Math.round(state.layout.zoom*100)}%</button><button aria-label={t('toolbar.zoomIn')} title={t('toolbar.zoomIn')} onClick={()=>zoomBy(1.15)}><Plus/></button></nav>
  {!!hidden.length&&<details className="hidden-frames"><summary>{t(hidden.length>1?'hidden.many':'hidden.one',{count:hidden.length})}</summary><div className="menu">{hidden.map(frame=><button key={frame.id} onClick={()=>setPosition(frame.id,{...framePosition(frame),hidden:false})}>{t('hidden.restore',{title:frame.title})}</button>)}</div></details>}
  {state.presenting&&<nav className="presentation-controls"><button onClick={leavePresentation}><ArrowLeft/>{t('present.canvas')} <kbd>Esc</kbd></button><span>{workspace.experiment.frames.find(frame=>frame.id===state.presenting)?.title}</span><NextSteps frameId={state.presenting}/><button aria-label={t('present.fullscreen')} onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>update({error:t('present.fullscreenUnavailable')}));}}><Maximize/></button><button onClick={()=>update({comments:!state.comments,inspector:false})}>{t('present.feedback')}</button></nav>}
  {(state.notice||state.error||workspace.diagnostics.length>0)&&<div className="notice" role="alert">{[state.notice, state.error ?? workspace.diagnostics.join(' · ')].filter(Boolean).join(' · ')}{state.error&&<button onClick={()=>void discardLayoutConflict()}>{t('notice.reloadLayout')}</button>}{state.notice&&!state.error&&<button onClick={()=>update({notice:undefined})}>{t('notice.close')}</button>}</div>}
  <MiniMap/><ConnectionControls/><InspectorPanel/><Comments/><CommentPopover/><StatusPanel/><NewFrame/><ConnectModal/><HistoryPanel/>
 </main>;
}
const root=document.getElementById('root'); if(root) createRoot(root).render(<App/>);
void initialize();
