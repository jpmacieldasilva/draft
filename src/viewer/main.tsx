import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MousePointer2, Scan, Info as InfoIcon, Play, MoreHorizontal, Columns2, X, Plus, Minus, Maximize, ArrowLeft, MessageSquare, MoveDiagonal, SquareDashed, Check, Expand } from 'lucide-react';
import { Markdown } from './markdown';
import { FlowConnections, MiniMap, ConnectionControls, FrameConnector } from './flow-canvas';
import { VisualEditor } from './visual-editor';
import { Button } from '@astryxdesign/core/Button';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './style.css';
import type { Frame, Position, Target } from '../protocol';
import { t } from '../i18n';
import { subscribe, snapshot, update, initialize, framePosition, iframes, setPosition, saveLayout, setLayout, fit, zoomBy, setMode, present, leavePresentation, zoomTo, syncBridge, mutate, refresh, discardLayoutConflict, activeClaim, compareGroups, nextSteps, followFlow, commentNumbers, presentationOrder, setPresentFill, focusComment, beginCommenting } from './store';
import { PROTOTYPE_LINKS_UI } from './features';
const PRODUCT_NAME = 'Draft';
function useStore() { return useSyncExternalStore(subscribe,snapshot); }
/** Screen size plus the space the presentation bar takes from the bottom edge. */
let stage={width:innerWidth,height:innerHeight,bar:0};
const stageListeners=new Set<()=>void>();
function measureStage() {
 const bar=document.querySelector('.presentation-controls')?.getBoundingClientRect();
 const next={width:innerWidth,height:innerHeight,bar:bar?Math.ceil(innerHeight-bar.top):0};
 if(next.width===stage.width&&next.height===stage.height&&next.bar===stage.bar) return;
 stage=next; stageListeners.forEach(listener=>listener());
}
function subscribeStage(listener:()=>void) {
 stageListeners.add(listener); window.addEventListener('resize',measureStage);
 const bar=document.querySelector('.presentation-controls'), observer=new ResizeObserver(measureStage);
 if(bar) observer.observe(bar);
 measureStage();
 return ()=>{ stageListeners.delete(listener); window.removeEventListener('resize',measureStage); observer.disconnect(); };
}
const SIDE_PANEL_SPACE=360;
/** Saved viewport, never scaled up; scaled down uniformly when it does not fit beside the bar and an open side panel. */
function stageBox(position:Position, panelOpen:boolean) {
 const narrow=stage.width<=900, pad=narrow?8:24;
 const width=(panelOpen&&!narrow?stage.width-SIDE_PANEL_SPACE:stage.width)-pad*2, height=stage.height-pad-Math.max(pad,stage.bar+12);
 const scale=Math.min(1,width/position.width,height/position.height);
 return {position:'absolute' as const,left:pad+(width-position.width*scale)/2,top:pad+(height-position.height*scale)/2,width:position.width,height:position.height,transform:scale<1?`scale(${scale})`:undefined,transformOrigin:'0 0'};
}
function useStage(active:boolean) { useSyncExternalStore(active?subscribeStage:noopSubscribe,()=>stage); }
const noopSubscribe=()=>()=>undefined;
function startMove(event:PointerEvent<HTMLElement>, frame:Frame, resize = false) {
 if(snapshot().workspace?.readOnly || snapshot().presenting || event.button!==0 || (event.target instanceof Element && event.target.closest('button,summary,input,select'))) return;
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
const RESIZE_STEP=10, RESIZE_FINE_STEP=1;
/** Arrows resize from the bottom-right corner; Shift is the fine step, matching arrow-key frame movement. */
function resizeWithKeys(event:KeyboardEvent<HTMLElement>, frame:Frame) {
 const directions: Record<string,[number,number]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 const direction=directions[event.key];
 if(!direction || snapshot().workspace?.readOnly || snapshot().presenting) return;
 event.preventDefault(); event.stopPropagation();
 const position=framePosition(frame), step=event.shiftKey?RESIZE_FINE_STEP:RESIZE_STEP;
 setPosition(frame.id,{...position,width:Math.min(4000,Math.max(160,position.width+direction[0]*step)),height:Math.min(4000,Math.max(120,position.height+direction[1]*step))});
}
const FOCUSABLE='a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,summary,[tabindex]:not([tabindex="-1"])';
function focusables(root:Element) { return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element=>element.checkVisibility?.() ?? element.offsetParent!==null); }
function usable(element:Element|null): element is HTMLElement { return element instanceof HTMLElement && element.isConnected && element.tagName!=='IFRAME' && element!==document.body && (element.checkVisibility?.() ?? element.offsetParent!==null); }
/** Focus only returns when it was lost with the closed layer, so a click elsewhere keeps its focus. */
function restoreFocus(opener:Element|null, fallbacks:string[]) {
 if(document.activeElement && document.activeElement!==document.body) return;
 const target=[opener,...fallbacks.map(selector=>document.querySelector(selector))].find(usable);
 target?.focus();
}
const RETURN_FALLBACKS=['.presentation-controls button','.frame.selected .frame-title','.workspace-title'];
function useReturnFocus(fallbacks:string[]) {
 const [opener]=useState(()=>document.activeElement);
 useEffect(()=>()=>restoreFocus(opener,fallbacks),[]);
}
function ReturnFocus({fallbacks}:{fallbacks:string[]}) { useReturnFocus(fallbacks); return null; }
function Modal({label,className,onClose,children}:{label:string;className:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLElement>(null);
 const [opener]=useState(()=>document.activeElement);
 useEffect(()=>{
  const node=ref.current; if(!node) return;
  (node.querySelector<HTMLElement>('[data-autofocus]') ?? node).focus();
  const guard=(event:FocusEvent)=>{ if(event.target instanceof Node && !node.contains(event.target)) (focusables(node)[0] ?? node).focus(); };
  document.addEventListener('focusin',guard);
  return ()=>{ document.removeEventListener('focusin',guard); restoreFocus(opener,RETURN_FALLBACKS); };
 },[]);
 const trap=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key!=='Tab' || !ref.current) return;
  const items=focusables(ref.current), first=items[0], last=items.at(-1), active=document.activeElement;
  if(!first || !last) { event.preventDefault(); return; }
  if(event.shiftKey && (active===first || active===ref.current)) { event.preventDefault(); last.focus(); }
  else if(!event.shiftKey && active===last) { event.preventDefault(); first.focus(); }
 };
 return <div className="scrim" onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className} onKeyDown={trap} onClick={event=>event.stopPropagation()}>{children}</section></div>;
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
 return <details className="viewport-menu"><summary aria-label={t('viewport.label',{title:frame.title})} title={t('viewport.title')}>{position.width} × {position.height}</summary><div className="menu viewport-panel"><strong>{t('viewport.heading')}</strong><form key={`${position.width}:${position.height}`} onSubmit={event=>resizeViewport(event,frame)}><div className="viewport-fields"><label>{t('viewport.width')}<input name="width" type="number" min="160" max="4000" defaultValue={position.width}/></label><label>{t('viewport.height')}<input name="height" type="number" min="120" max="4000" defaultValue={position.height}/></label></div><button type="submit" disabled={state.workspace?.readOnly}>{t('viewport.apply')}</button></form><div className="viewport-presets">{[{label:t('viewport.phone'),width:390,height:844},{label:t('viewport.tablet'),width:768,height:1024},{label:t('viewport.desktop'),width:1440,height:900}].map(preset=><button key={preset.label} disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,width:preset.width,height:preset.height})}>{preset.label}</button>)}</div><button disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,...frame.viewport})}>{t('viewport.reset')}</button></div></details>;
}
function renameFrame(event:FormEvent<HTMLFormElement>, frameId:string) {
 event.preventDefault(); const title=new FormData(event.currentTarget).get('title'); if(typeof title==='string' && title.trim()) void mutate(`frames/${encodeURIComponent(frameId)}/rename`,{title:title.trim()});
}
let savedTimer: ReturnType<typeof setTimeout> | undefined;
function submitFeedback(event:FormEvent<HTMLFormElement>) {
 event.preventDefault(); const message=new FormData(event.currentTarget).get('message'),target=snapshot().target;
 if(!target || typeof message!=='string' || !message.trim()) return;
 void mutate('feedback',{...target,message:message.trim()}).then(()=>{if(snapshot().error) return; update({target:undefined,feedback:undefined,commentSaved:true});setMode('interact');clearTimeout(savedTimer);savedTimer=setTimeout(()=>update({commentSaved:false}),4000);});
}
function closeCommentPopover() { update({target:undefined,feedback:undefined}); }
function popoverPosition(rect:Target['rect'], frameWidth:number, frameHeight:number) {
 const width=Math.min(320,Math.max(248,frameWidth-16));
 const left=Math.max(8,Math.min(rect.x,frameWidth-width-8));
 const below=rect.y+rect.height+12;
 const flip=below+200>frameHeight;
 const top=flip?Math.max(8,rect.y-10):below;
 return {left,top,width,above:flip,transform:flip?'translateY(-100%)':undefined};
}
function CommentPopover({frame}:{frame:Frame}) {
 const state=useStore(), workspace=state.workspace;
 if(!workspace) return null;
 const compose=state.mode==='comment'&&state.target?.frameId===frame.id?state.target.target:undefined;
 const viewing=state.feedback?workspace.feedback.find(comment=>comment.id===state.feedback&&comment.frameId===frame.id):undefined;
 if(!compose&&!viewing) return null;
 const target=viewing?.target??compose;
 if(!target) return null;
 const position=framePosition(frame);
 const box=popoverPosition(target.rect,position.width,position.height);
 const summary=targetSummary(target);
 const number=viewing?commentNumbers(workspace.feedback).get(viewing.id):undefined;
 const composing=!!compose&&!workspace.readOnly;
 return <div className={`comment-popover${composing?' comment-popover--compose':''}${viewing?` comment-popover--${viewing.status}`:''}${box.above?' comment-popover--above':''}`} role="dialog" aria-label={t('comments.popover')} style={{left:box.left,top:box.top,width:box.width,transform:box.transform}} onPointerDown={event=>event.stopPropagation()}>
  <span className="comment-popover-caret" aria-hidden="true"/>
  <header className="comment-popover-head">
   {number!=null&&<span className="comment-popover-pin">{number}</span>}
   <div className="comment-popover-meta">
    <div className="comment-popover-eyebrow">
     <span className="comment-popover-kind">{summary.kind}</span>
     {viewing&&<span className={`comment-popover-status comment-popover-status--${viewing.status}`}>{viewing.status==='resolved'?t('comments.resolved'):t('comments.open')}</span>}
     {composing&&<span className="comment-popover-status comment-popover-status--draft">{t('comments.draft')}</span>}
    </div>
    <p className="comment-popover-target" title={summary.title}>{summary.text}</p>
   </div>
   <button type="button" className="icon-button comment-popover-close" aria-label={t('comments.close')} onClick={closeCommentPopover}><X/></button>
  </header>
  {composing?<form onSubmit={submitFeedback} className="comment-popover-form">
   <label className="comment-popover-label" htmlFor={`comment-${frame.id}`}>{t('comments.prompt')}</label>
   <textarea id={`comment-${frame.id}`} autoFocus name="message" required maxLength={8000} placeholder={t('comments.placeholder')}/>
   <footer className="comment-popover-foot"><button type="button" className="comment-popover-secondary" onClick={closeCommentPopover}>{t('comments.cancel')}</button><button className="primary comment-popover-submit" disabled={state.busy} aria-busy={state.busy} type="submit">{t('comments.save')}</button></footer>
  </form>
  :<><p className="comment-popover-body">{viewing?.message}</p>{!workspace.readOnly&&viewing&&<footer className="comment-popover-foot comment-popover-foot--solo"><button type="button" className="comment-popover-secondary" onClick={()=>void mutate(`feedback/${encodeURIComponent(viewing.id)}`,{status:viewing.status==='open'?'resolved':'open'})}>{viewing.status==='open'?t('comments.resolve'):t('comments.reopen')}</button></footer>}</>}
 </div>;
}
function targetSummary(target:Target) {
 if(target.kind==='region') return {kind:t('comments.kindRegion'),text:`${Math.round(target.rect.width)} × ${Math.round(target.rect.height)} px`,title:target.label};
 const label=target.label.replace(/\s+/g,' ').trim();
 return {kind:t('comments.kindElement'),text:label.length>120?`${label.slice(0,119)}…`:label,title:label};
}
function NewFrame() {
 const state=useStore(); if(!state.newFrame) return null;
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const title=new FormData(event.currentTarget).get('title');if(typeof title!=='string'||!title.trim())return;void mutate('frames',{title}).then(()=>{if(!snapshot().error)update({newFrame:false});});};
 const close=()=>update({newFrame:false});
 return <Modal label={t('app.addPrototype')} className="info-sheet create-sheet" onClose={close}><button className="close" aria-label={t('create.close')} onClick={close}><X/></button><p className="muted">{t('create.eyebrow')}</p><h1>{t('app.addPrototype')}</h1><p className="create-copy">{t('create.copy')}</p><form onSubmit={submit} className="create-form"><label>{t('create.name')}<input data-autofocus name="title" placeholder={t('create.placeholder')} maxLength={200} required/></label><div className="create-actions"><button type="button" onClick={close}>{t('create.cancel')}</button><button className="primary" type="submit" disabled={state.busy} aria-busy={state.busy}>{t('create.submit')}</button></div></form></Modal>;
}
function FrameView({frame}:{frame:Frame}) {
 const state=useStore(), position=framePosition(frame), presenting=state.presenting===frame.id;
 const comments=state.workspace?.feedback.filter(comment=>comment.frameId===frame.id) ?? [];
 const numbers=commentNumbers(comments);
 const claim = activeClaim(frame.id);
 const filled=presenting&&state.presentFill;
 useStage(presenting&&!filled);
 return <article className={`frame ${presenting?'presenting':''}${filled?' fill':''} ${state.selected===frame.id?'selected':''}${claim?' agent-active':''}`} style={{left:position.x,top:position.y,width:position.width,height:position.height+44,display:position.hidden&&!presenting?'none':undefined}} aria-label={frame.title} data-frame-id={frame.id} title={claim ? t('frame.agentHere') : undefined}>
  <header className="frame-header" onPointerDown={event=>startMove(event,frame)}>
   <button className="frame-title" onClick={()=>update({selected:frame.id})}>{frame.title}</button>
   {frame.state&&<span className="frame-badge frame-state" title={t('frame.stateTitle')}>{frame.state}</span>}
   {frame.role&&<span className={`frame-badge frame-role-${frame.role}`} title={frame.group?t('frame.groupTitle',{group:frame.group}):undefined}>{t(`role.${frame.role}`)}</span>}
   {claim&&<span className="agent-pill" title={t('frame.agentHere')}>{t('frame.agent')}</span>}
   <ViewportControls frame={frame}/>
   <button className="icon-button" aria-label={t('frame.info',{title:frame.title})} title={t('frame.infoTitle')} onClick={()=>update({info:frame.id})}><InfoIcon/></button>
   <button className="icon-button" aria-label={t('frame.present',{title:frame.title})} title={t('frame.presentTitle')} onClick={()=>present(frame.id)}><Play/></button>
   {!state.workspace?.readOnly&&<details className="frame-menu"><summary aria-label={t('frame.options',{title:frame.title})}><MoreHorizontal/></summary><div className="menu">
    <form onSubmit={event=>renameFrame(event,frame.id)}><label>{t('frame.newTitle')}<input name="title" defaultValue={frame.title} required maxLength={120}/></label><button type="submit">{t('frame.rename')}</button></form>
    <button onClick={()=>void mutate(`frames/${encodeURIComponent(frame.id)}/duplicate`,{})}>{t('frame.duplicate')}</button>
    <button onClick={()=>setPosition(frame.id,{...position,hidden:true})}>{t('frame.hide')}</button>
   </div></details>}
  </header>
  {!!state.blocked[frame.id]?.length&&<p className="frame-warning" role="status">{t('frame.blocked',{hosts:state.blocked[frame.id].join(', ')})}</p>}
  <div className="frame-content" style={presenting&&!filled?stageBox(position,state.inspector||state.mode==='comment'||!!state.feedback):undefined}>
   {frame.error ? <div className="frame-error"><h2>{t('frame.errorTitle')}</h2><p>{frame.error}</p><button onClick={()=>void refresh()}>{t('app.retry')}</button></div> : <iframe ref={element=>{if(element) iframes.set(frame.id,element);else iframes.delete(frame.id);}} src={frame.url ?? `./content/${frame.entry}`} title={frame.title} sandbox="allow-scripts" onLoad={()=>syncBridge(frame.id)}/>}
   {!filled&&comments.filter(comment=>comment.status==='open').map(comment=><button type="button" key={comment.id} className={`pin ${state.feedback===comment.id?'active':''}`} style={{left:comment.target.rect.x,top:comment.target.rect.y}} title={comment.message} aria-label={t('frame.comment',{n:numbers.get(comment.id) ?? '',frame:frame.title,message:comment.message})} onClick={event=>{event.stopPropagation();focusComment(comment.id);}}>{numbers.get(comment.id)}</button>)}
   {state.target?.frameId===frame.id&&state.mode==='comment'&&<div className="selection" style={{left:state.target.target.rect.x,top:state.target.target.rect.y,width:state.target.target.rect.width,height:state.target.target.rect.height}}/>}
   <CommentPopover frame={frame}/>
  </div>
  {!state.workspace?.readOnly&&<div className="resize" title={t('frame.resizeTitle')} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={160} aria-valuemax={4000} aria-valuenow={position.width} aria-valuetext={t('frame.resizeValue',{width:position.width,height:position.height})} aria-label={t('frame.resize',{title:frame.title})} onPointerDown={event=>startMove(event,frame,true)} onKeyDown={event=>resizeWithKeys(event,frame)}><MoveDiagonal/></div>}
  {!state.workspace?.readOnly&&!presenting&&<FrameConnector frameId={frame.id}/>}
 </article>;
}
function Info() {
 const state=useStore(); if(!state.info) return null;
 const frame=state.workspace?.experiment.frames.find(frame=>frame.id===state.info);
 const readme=frame?.readme ?? (frame?t('info.noFrameReadme'):state.workspace?.readme || t('info.noReadme'));
 const close=()=>update({info:undefined});
 return <Modal label={t('frame.infoTitle')} className="info-sheet" onClose={close}><button className="close" aria-label={t('info.close')} onClick={close}><X/></button><p className="muted">{frame?t('info.aboutFrame'):t('info.aboutWorkspace')}</p><h1>{frame?.title ?? state.workspace?.experiment.title}</h1>{!frame&&<DecisionSummary/>}{frame&&<FrameMeta frame={frame}/>}<Markdown source={readme}/>{frame&&<Button label={t('info.presentPrototype')} onClick={()=>present(frame.id)}/>}</Modal>;
}
function NextSteps({frameId}:{frameId:string}) {
 const state=useStore();
 const steps=nextSteps(frameId);
 if(!steps.length) return null;
 return <nav className="presentation-flow" aria-label={t('present.nextSteps')}>{steps.map(edge=><button key={edge.to} onClick={()=>followFlow(edge.to)} title={t('present.goTo',{title:state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title ?? edge.to})}>{edge.label || state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title || edge.to}</button>)}</nav>;
}
function PresentationPosition({frameId}:{frameId:string}) {
 useStore();
 const order=presentationOrder(), index=order.findIndex(frame=>frame.id===frameId);
 if(index<0||order.length<2) return null;
 return <p className="present-position"><span aria-hidden="true">{index+1}/{order.length}</span><span className="sr-only">{t('present.position',{n:index+1,total:order.length})}</span></p>;
}
function DecisionSummary() {
 const decision=useStore().workspace?.experiment.decision;
 if(!decision) return null;
 return <dl className="decision">{decision.hypothesis&&<><dt>{t('meta.hypothesis')}</dt><dd>{decision.hypothesis}</dd></>}{decision.criteria&&<><dt>{t('meta.criteria')}</dt><dd>{decision.criteria}</dd></>}</dl>;
}
function FrameMeta({frame}:{frame:Frame}) {
 if(!frame.state&&!frame.role&&!frame.tests&&!frame.signal) return null;
 return <dl className="frame-meta">{frame.state&&<><dt>{t('meta.state')}</dt><dd>{frame.state}</dd></>}{frame.role&&<><dt>{t('meta.role')}</dt><dd>{t(`role.${frame.role}`)}{frame.group?` · ${frame.group}`:''}</dd></>}{frame.tests&&<><dt>{t('meta.tests')}</dt><dd>{frame.tests}</dd></>}{frame.signal&&<><dt>{t('meta.signal')}</dt><dd><code>{frame.signal}</code></dd></>}</dl>;
}
function Compare() {
 const state=useStore(); const workspace=state.workspace;
 if(!state.compare||!workspace) return null;
 const groups=compareGroups(workspace.experiment.frames);
 const group=groups.find(candidate=>candidate.name===state.compare?.group)??groups[0];
 if(!group) return null;
 const variant=group.variants.find(frame=>frame.id===state.compare?.variant)??group.variants[0];
 const decision=workspace.experiment.decision;
 const close=()=>update({compare:undefined});
 return <Modal label={t('compare.label')} className="compare-sheet" onClose={close}>
  <header className="compare-header"><div><p className="muted">{t('compare.eyebrow')}</p><h1>{t('compare.title')}</h1></div>
   {groups.length>1&&<label>{t('compare.group')}<select value={group.name} onChange={event=>update({compare:{group:event.currentTarget.value}})}>{groups.map(candidate=><option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}</select></label>}
   <label>{t('compare.variant')}<select value={variant.id} onChange={event=>update({compare:{group:group.name,variant:event.currentTarget.value}})}>{group.variants.map(frame=><option key={frame.id} value={frame.id}>{frame.title}</option>)}</select></label>
   <button className="close" aria-label={t('compare.close')} onClick={close}><X/></button></header>
  {(decision?.criteria||decision?.hypothesis)&&<dl className="decision compare-criteria">{decision.hypothesis&&<><dt>{t('meta.hypothesis')}</dt><dd>{decision.hypothesis}</dd></>}{decision.criteria&&<><dt>{t('meta.criteria')}</dt><dd>{decision.criteria}</dd></>}</dl>}
  <div className="compare-panes">{([[t('role.control'),group.control],[t('role.variant'),variant]] as const).map(([label,frame])=><figure key={label}><figcaption><span className="muted">{label}</span><strong>{frame.title}</strong>{frame.tests&&<p>{frame.tests}</p>}{frame.signal&&<code>{frame.signal}</code>}</figcaption><iframe key={frame.id} title={`${label}: ${frame.title}`} src={frame.url ?? `./content/${frame.entry}`} sandbox="allow-scripts" style={{width:frame.viewport.width,height:frame.viewport.height}}/></figure>)}</div>
 </Modal>;
}
function InspectorPanel() {
 const state=useStore();
 if(!state.inspector || state.target?.target.kind!=='element') return null;
 return <aside className="side-panel inspector-panel" aria-label={t('inspector.title')}><header><h2>{t('inspector.title')}</h2><button aria-label={t('inspector.close')} onClick={()=>update({inspector:false,target:undefined})}><X/></button></header><ReturnFocus fallbacks={['.toolbar button[aria-pressed=true]',...RETURN_FALLBACKS]}/>
  <VisualEditor key={`${state.target.frameId}:${state.target.target.selector}`} frameId={state.target.frameId} target={state.target.target}/>
 </aside>;
}
function App() {
 const state=useStore(),workspace=state.workspace;
 const [barFresh,setBarFresh]=useState(false);
 useEffect(()=>{ if(!state.presenting) return; setBarFresh(true); const timer=setTimeout(()=>setBarFresh(false),2000); return ()=>clearTimeout(timer); },[state.presenting]);
 if(!workspace) return <main className="loading"><span className="brand">{PRODUCT_NAME}<span>✳</span></span><p>{state.error ?? t('app.loading')}</p>{state.error&&<Button label={t('app.retry')} onClick={()=>void refresh()}/>}</main>;
 const hidden=workspace.experiment.frames.filter(frame=>framePosition(frame).hidden);
 const openCount=workspace.feedback.filter(comment=>comment.status==='open').length;
 const openCommentsLabel=openCount?t(openCount===1?'app.commentsOpenOne':'app.commentsOpenMany',{count:openCount}):t('app.comments');
 return <main className={state.presenting?'app is-presenting':'app'}>
  <header className="topbar"><div className="identity"><span className="brand">{PRODUCT_NAME}<span>✳</span></span><span className="divider"/><button className="workspace-title" aria-haspopup="dialog" title={t('app.workspaceInfo')} onClick={()=>update({info:'workspace'})}>{workspace.experiment.title}<InfoIcon aria-hidden="true"/></button></div><div className="topbar-end"><span className="save-state" role="status">{workspace.readOnly?t('app.readOnly'):state.busy?t('app.saving'):''}</span>{!workspace.readOnly&&<button className="add-frame" onClick={()=>update({newFrame:true})}><Plus/>{t('app.addPrototype')}</button>}{compareGroups(workspace.experiment.frames).length>0&&<button className="compare-toggle" onClick={()=>update({compare:{group:compareGroups(workspace.experiment.frames)[0].name}})}><Columns2/>{t('app.compare')}</button>}{!workspace.readOnly?<button className="feedback-toggle" aria-label={openCommentsLabel} title={t('toolbar.commentTitle')} onClick={()=>beginCommenting()}><MessageSquare/>{t('toolbar.comment')}</button>:<span className="feedback-toggle" aria-label={openCommentsLabel}><MessageSquare/>{t('app.comments')} <span>{openCount}</span></span>}</div></header>
  <div className="canvas" style={{backgroundSize:`${24*state.layout.zoom}px ${24*state.layout.zoom}px`,backgroundPosition:`${state.layout.x}px ${state.layout.y}px`}} onPointerDown={startPan} onWheel={event=>{if(event.target!==event.currentTarget)return;if(event.ctrlKey||event.metaKey){event.preventDefault();zoomBy(event.deltaY>0?.94:1.06);}else setLayout({...state.layout,x:state.layout.x-event.deltaX,y:state.layout.y-event.deltaY});}}>
   <div className="world" style={{transform:state.presenting?'none':`translate(${state.layout.x}px,${state.layout.y}px) scale(${state.layout.zoom})`}}><FlowConnections/>{workspace.experiment.frames.map(frame=><FrameView key={frame.id} frame={frame}/>)}</div>
   {workspace.experiment.frames.length===0&&<div className="empty-canvas"><h1>{t('app.emptyTitle')}</h1><p>{t('app.emptyBody')}</p></div>}
  </div>
  <nav className="toolbar" aria-label={t('toolbar.label')}><button className={state.mode==='interact'?'active':''} title={t('toolbar.interactTitle')} onClick={()=>{update({inspector:false,target:undefined,feedback:undefined});setMode('interact');}} aria-pressed={state.mode==='interact'}><MousePointer2/><span>{t('toolbar.interact')}</span></button>{!workspace.readOnly&&<><button className={state.mode==='element'?'active':''} title={t('toolbar.inspectTitle')} onClick={()=>{update({inspector:false,target:undefined,feedback:undefined,comments:false});setMode('element');}} aria-pressed={state.mode==='element'}><Scan/><span>{t('toolbar.inspect')}</span></button><button className={state.mode==='comment'?'active':''} title={t('toolbar.commentTitle')} onClick={()=>{if(state.mode==='comment'){setMode('interact');return;}beginCommenting();}} aria-pressed={state.mode==='comment'}><SquareDashed/><span>{t('toolbar.comment')}</span></button></>}<span className="divider"/><button aria-label={t('toolbar.zoomOut')} onClick={()=>zoomBy(1/1.15)}><Minus/></button><button className="zoom" title={t('toolbar.resetZoomTitle')} aria-label={t('toolbar.resetZoom',{zoom:`${Math.round(state.layout.zoom*100)}%`})} onClick={()=>zoomTo(1)}>{Math.round(state.layout.zoom*100)}%</button><button aria-label={t('toolbar.zoomIn')} onClick={()=>zoomBy(1.15)}><Plus/></button><button title={t('toolbar.fitTitle')} aria-label={t('toolbar.fit')} onClick={fit}><Maximize/></button></nav>
  {!!hidden.length&&<details className="hidden-frames"><summary>{t(hidden.length>1?'hidden.many':'hidden.one',{count:hidden.length})}</summary><div className="menu">{hidden.map(frame=><button key={frame.id} onClick={()=>setPosition(frame.id,{...framePosition(frame),hidden:false})}>{t('hidden.restore',{title:frame.title})}</button>)}</div></details>}
  {state.presenting&&<nav className={`presentation-controls${barFresh?' fresh':''}`}><button onClick={leavePresentation}><ArrowLeft/>{t('present.canvas')} <kbd>Esc</kbd></button><span>{workspace.experiment.frames.find(frame=>frame.id===state.presenting)?.title}</span><PresentationPosition frameId={state.presenting}/>{PROTOTYPE_LINKS_UI&&<NextSteps frameId={state.presenting}/>}<button aria-pressed={state.presentFill} title={t('present.fillTitle')} onClick={()=>setPresentFill(!state.presentFill)}><Expand/>{t('present.fill')}</button>{!workspace.readOnly&&<button aria-pressed={state.mode==='comment'} title={state.presentFill?t('present.commentFillTitle'):t('toolbar.commentTitle')} onClick={()=>{if(state.mode==='comment'){setMode('interact');return;}if(state.presentFill)setPresentFill(false);beginCommenting();}}><SquareDashed/>{t('toolbar.comment')}</button>}{openCount>0&&<span className="present-comment-count" aria-label={openCommentsLabel}>{openCount}</span>}</nav>}
  {!state.presenting&&state.mode==='element'&&<div className="mode-hint">{t('hint.inspect')}<button onClick={()=>setMode('interact')}>{t('hint.done')}</button></div>}
  {state.mode==='comment'&&<div className={state.presenting?'mode-hint mode-hint--stage':'mode-hint'}>{t('hint.comment')}<button onClick={()=>{closeCommentPopover();setMode('interact');}}>{t('hint.done')}</button></div>}
  {state.commentSaved&&<p className="comment-saved-toast" role="status"><Check aria-hidden="true"/>{t('comments.saved')}</p>}
  {(state.notice||state.error||workspace.diagnostics.length>0)&&<div className="notice" role="alert">{[state.notice, state.error ?? workspace.diagnostics.join(' · ')].filter(Boolean).join(' · ')}{state.error&&<button onClick={()=>void discardLayoutConflict()}>{t('notice.reloadLayout')}</button>}{state.notice&&!state.error&&<button onClick={()=>update({notice:undefined})}>{t('notice.close')}</button>}</div>}
  <MiniMap/><ConnectionControls/><Info/><InspectorPanel/><NewFrame/><Compare/>
 </main>;
}
const root=document.getElementById('root'); if(root) createRoot(root).render(<App/>);
void initialize();
