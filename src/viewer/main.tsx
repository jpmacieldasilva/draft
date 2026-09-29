import { useSyncExternalStore, type PointerEvent, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { MousePointer2, Scan, Info as InfoIcon, Play, MoreHorizontal, ChevronDown, X, Plus, Minus, Maximize, ArrowLeft, MessageSquare, MoveDiagonal, SquareDashed } from 'lucide-react';
import { Markdown } from './markdown';
import { FlowConnections, MiniMap, ConnectionControls, FrameConnector } from './flow-canvas';
import { VisualEditor } from './visual-editor';
import { Button } from '@astryxdesign/core/Button';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './style.css';
import type { Frame, Position } from '../protocol';
import { t } from '../i18n';
import { subscribe, snapshot, update, initialize, framePosition, iframes, setPosition, saveLayout, setLayout, fit, zoomBy, setMode, present, leavePresentation, syncBridge, mutate, refresh, discardLayoutConflict, activeClaim, compareGroups, nextSteps, followFlow } from './store';
const PRODUCT_NAME = 'Draft';
function useStore() { return useSyncExternalStore(subscribe,snapshot); }
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
function submitFeedback(event:FormEvent<HTMLFormElement>) {
 event.preventDefault(); const message=new FormData(event.currentTarget).get('message'),target=snapshot().target;
 if(!target || typeof message!=='string' || !message.trim()) return;
 void mutate('feedback',{...target,message:message.trim()}).then(()=>{if(!snapshot().error) {update({target:undefined});setMode('interact');}});
}
function NewFrame() {
 const state=useStore(); if(!state.newFrame) return null;
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const title=new FormData(event.currentTarget).get('title');if(typeof title!=='string'||!title.trim())return;void mutate('frames',{title}).then(()=>{if(!snapshot().error)update({newFrame:false});});};
 return <div className="scrim" onClick={()=>update({newFrame:false})}><section role="dialog" aria-modal="true" aria-label={t('app.addPrototype')} className="info-sheet create-sheet" onClick={event=>event.stopPropagation()}><button className="close" aria-label={t('create.close')} onClick={()=>update({newFrame:false})}><X/></button><p className="muted">{t('create.eyebrow')}</p><h1>{t('app.addPrototype')}</h1><p className="create-copy">{t('create.copy')}</p><form onSubmit={submit} className="create-form"><label>{t('create.name')}<input autoFocus name="title" placeholder={t('create.placeholder')} maxLength={200} required/></label><div className="create-actions"><button type="button" onClick={()=>update({newFrame:false})}>{t('create.cancel')}</button><button className="primary" type="submit" disabled={state.busy}>{t('create.submit')}</button></div></form></section></div>;
}
function FrameView({frame}:{frame:Frame}) {
 const state=useStore(), position=framePosition(frame), presenting=state.presenting===frame.id;
 const comments=state.workspace?.feedback.filter(comment=>comment.frameId===frame.id) ?? [];
 const claim = activeClaim(frame.id);
 return <article className={`frame ${presenting?'presenting':''} ${state.selected===frame.id?'selected':''}${claim?' agent-active':''}`} style={{left:position.x,top:position.y,width:position.width,height:position.height+44,display:position.hidden&&!presenting?'none':undefined}} aria-label={frame.title} data-frame-id={frame.id} title={claim ? t('frame.agentHere') : undefined}>
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
  <div className="frame-content">
   {frame.error ? <div className="frame-error"><h2>{t('frame.errorTitle')}</h2><p>{frame.error}</p><button onClick={()=>void refresh()}>{t('app.retry')}</button></div> : <iframe ref={element=>{if(element) iframes.set(frame.id,element);else iframes.delete(frame.id);}} src={frame.url ?? `./content/${frame.entry}`} title={frame.title} sandbox="allow-scripts" onLoad={()=>syncBridge(frame.id)}/>}
   {comments.filter(comment=>comment.status==='open').map((comment,index)=><button key={comment.id} className={`pin ${state.feedback===comment.id?'active':''}`} style={{left:comment.target.rect.x,top:comment.target.rect.y}} title={comment.message} aria-label={t('frame.comment',{n:index+1,message:comment.message})} onClick={()=>update({feedback:comment.id,comments:true,inspector:false,target:undefined,selected:frame.id})}>{index+1}</button>)}
   {state.target?.frameId===frame.id&&state.target.target.kind==='region'&&<div className="selection" style={{left:state.target.target.rect.x,top:state.target.target.rect.y,width:state.target.target.rect.width,height:state.target.target.rect.height}}/>}
  </div>
  {!state.workspace?.readOnly&&<div className="resize" title={t('frame.resizeTitle')} role="separator" tabIndex={0} aria-label={t('frame.resize',{title:frame.title})} onPointerDown={event=>startMove(event,frame,true)}><MoveDiagonal/></div>}
  {!state.workspace?.readOnly&&!presenting&&<FrameConnector frameId={frame.id}/>}
 </article>;
}
function Info() {
 const state=useStore(); if(!state.info) return null;
 const frame=state.workspace?.experiment.frames.find(frame=>frame.id===state.info);
 const readme=frame?.readme ?? (frame?t('info.noFrameReadme'):state.workspace?.readme || t('info.noReadme'));
 return <div className="scrim" onClick={()=>update({info:undefined})}><section role="dialog" aria-modal="true" aria-label={t('frame.infoTitle')} className="info-sheet" onClick={event=>event.stopPropagation()}><button className="close" aria-label={t('info.close')} onClick={()=>update({info:undefined})}><X/></button><p className="muted">{frame?t('info.aboutFrame'):t('info.aboutWorkspace')}</p><h1>{frame?.title ?? state.workspace?.experiment.title}</h1>{!frame&&<DecisionSummary/>}{frame&&<FrameMeta frame={frame}/>}<Markdown source={readme}/>{frame&&<Button label={t('info.presentPrototype')} onClick={()=>present(frame.id)}/>}</section></div>;
}
function NextSteps({frameId}:{frameId:string}) {
 const state=useStore();
 const steps=nextSteps(frameId);
 if(!steps.length) return null;
 return <nav className="presentation-flow" aria-label={t('present.nextSteps')}>{steps.map(edge=><button key={edge.to} onClick={()=>followFlow(edge.to)} title={t('present.goTo',{title:state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title ?? edge.to})}>{edge.label || state.workspace?.experiment.frames.find(frame=>frame.id===edge.to)?.title || edge.to}</button>)}</nav>;
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
 return <div className="scrim" onClick={close}><section role="dialog" aria-modal="true" aria-label={t('compare.label')} className="compare-sheet" onClick={event=>event.stopPropagation()}>
  <header className="compare-header"><div><p className="muted">{t('compare.eyebrow')}</p><h1>{t('compare.title')}</h1></div>
   {groups.length>1&&<label>{t('compare.group')}<select value={group.name} onChange={event=>update({compare:{group:event.currentTarget.value}})}>{groups.map(candidate=><option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}</select></label>}
   <label>{t('compare.variant')}<select value={variant.id} onChange={event=>update({compare:{group:group.name,variant:event.currentTarget.value}})}>{group.variants.map(frame=><option key={frame.id} value={frame.id}>{frame.title}</option>)}</select></label>
   <button className="close" aria-label={t('compare.close')} onClick={close}><X/></button></header>
  {(decision?.criteria||decision?.hypothesis)&&<dl className="decision compare-criteria">{decision.hypothesis&&<><dt>{t('meta.hypothesis')}</dt><dd>{decision.hypothesis}</dd></>}{decision.criteria&&<><dt>{t('meta.criteria')}</dt><dd>{decision.criteria}</dd></>}</dl>}
  <div className="compare-panes">{([[t('role.control'),group.control],[t('role.variant'),variant]] as const).map(([label,frame])=><figure key={label}><figcaption><span className="muted">{label}</span><strong>{frame.title}</strong>{frame.tests&&<p>{frame.tests}</p>}{frame.signal&&<code>{frame.signal}</code>}</figcaption><iframe key={frame.id} title={`${label}: ${frame.title}`} src={frame.url ?? `./content/${frame.entry}`} sandbox="allow-scripts" style={{width:frame.viewport.width,height:frame.viewport.height}}/></figure>)}</div>
 </section></div>;
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
 const compose=state.target?.target.kind==='region' ? state.target : undefined;
 return <aside className="side-panel comments-panel" aria-label={t('comments.label')}><header><h2>{t('app.comments')}</h2><button aria-label={t('comments.close')} onClick={()=>update({comments:false,target:undefined})}><X/></button></header>
  {compose&&<form onSubmit={submitFeedback} className="comment-compose"><span className="muted">{t('comments.region')}</span><strong>{compose.target.label}</strong><code>{Math.round(compose.target.rect.width)} × {Math.round(compose.target.rect.height)} px</code><label>{t('comments.prompt')}<textarea autoFocus name="message" required maxLength={8000} placeholder={t('comments.placeholder')}/></label><button className="primary" disabled={state.busy} type="submit">{t('comments.save')}</button></form>}
  {!comments.length&&!compose&&<p className="empty-copy">{t('comments.empty')}</p>}
  <div className="comment-list">{comments.map(comment=><section key={comment.id} className={`comment ${comment.status==='resolved'?'resolved':''} ${state.feedback===comment.id?'focused':''}`}><span className="muted">{state.workspace?.experiment.frames.find(frame=>frame.id===comment.frameId)?.title}</span><strong>{comment.target.label}</strong><p>{comment.message}</p><footer><span>{comment.status==='resolved'?t('comments.resolved'):t('comments.open')}</span>{!state.workspace?.readOnly&&<button onClick={()=>void mutate(`feedback/${encodeURIComponent(comment.id)}`,{status:comment.status==='open'?'resolved':'open'})}>{comment.status==='open'?t('comments.resolve'):t('comments.reopen')}</button>}</footer></section>)}</div>
 </aside>;
}
function App() {
 const state=useStore(),workspace=state.workspace;
 if(!workspace) return <main className="loading"><span className="brand">{PRODUCT_NAME}<span>✳</span></span><p>{state.error ?? t('app.loading')}</p>{state.error&&<Button label={t('app.retry')} onClick={()=>void refresh()}/>}</main>;
 const hidden=workspace.experiment.frames.filter(frame=>framePosition(frame).hidden);
 return <main className={state.presenting?'app is-presenting':'app'}>
  <header className="topbar"><div className="identity"><span className="brand">{PRODUCT_NAME}<span>✳</span></span><span className="divider"/><button className="workspace-title" onClick={()=>update({info:'workspace'})}>{workspace.experiment.title}<ChevronDown/></button></div><div className="topbar-end"><span className="save-state" role="status">{workspace.readOnly?t('app.readOnly'):state.busy?t('app.saving'):''}</span>{!workspace.readOnly&&<button className="add-frame" onClick={()=>update({newFrame:true})}><Plus/>{t('app.addPrototype')}</button>}{compareGroups(workspace.experiment.frames).length>0&&<button className="compare-toggle" onClick={()=>update({compare:{group:compareGroups(workspace.experiment.frames)[0].name}})}>{t('app.compare')}</button>}<button className="feedback-toggle" onClick={()=>update({comments:!state.comments,inspector:false})}><MessageSquare/>{t('app.comments')} <span>{workspace.feedback.filter(comment=>comment.status==='open').length}</span></button></div></header>
  <div className="canvas" style={{backgroundSize:`${24*state.layout.zoom}px ${24*state.layout.zoom}px`,backgroundPosition:`${state.layout.x}px ${state.layout.y}px`}} onPointerDown={startPan} onWheel={event=>{if(event.target!==event.currentTarget)return;if(event.ctrlKey||event.metaKey){event.preventDefault();zoomBy(event.deltaY>0?.94:1.06);}else setLayout({...state.layout,x:state.layout.x-event.deltaX,y:state.layout.y-event.deltaY});}}>
   <div className="world" style={{transform:state.presenting?'none':`translate(${state.layout.x}px,${state.layout.y}px) scale(${state.layout.zoom})`}}><FlowConnections/>{workspace.experiment.frames.map(frame=><FrameView key={frame.id} frame={frame}/>)}</div>
   {workspace.experiment.frames.length===0&&<div className="empty-canvas"><h1>{t('app.emptyTitle')}</h1><p>{t('app.emptyBody')}</p></div>}
  </div>
  <nav className="toolbar" aria-label={t('toolbar.label')}><button className={state.mode==='interact'?'active':''} title={t('toolbar.interactTitle')} onClick={()=>setMode('interact')} aria-pressed={state.mode==='interact'}><MousePointer2/><span>{t('toolbar.interact')}</span></button>{!workspace.readOnly&&<><button className={state.mode==='element'?'active':''} title={t('toolbar.inspectTitle')} onClick={()=>setMode('element')} aria-pressed={state.mode==='element'}><Scan/><span>{t('toolbar.inspect')}</span></button><button className={state.mode==='comment'?'active':''} title={t('toolbar.commentTitle')} onClick={()=>setMode('comment')} aria-pressed={state.mode==='comment'}><SquareDashed/><span>{t('toolbar.comment')}</span></button></>}<span className="divider"/><button aria-label={t('toolbar.zoomOut')} onClick={()=>zoomBy(1/1.15)}><Minus/></button><button className="zoom" title={t('toolbar.fitTitle')} onClick={fit}>{Math.round(state.layout.zoom*100)}%</button><button aria-label={t('toolbar.zoomIn')} onClick={()=>zoomBy(1.15)}><Plus/></button><button title={t('toolbar.fitTitle')} aria-label={t('toolbar.fit')} onClick={fit}><Maximize/></button></nav>
  {!!hidden.length&&<details className="hidden-frames"><summary>{t(hidden.length>1?'hidden.many':'hidden.one',{count:hidden.length})}</summary><div className="menu">{hidden.map(frame=><button key={frame.id} onClick={()=>setPosition(frame.id,{...framePosition(frame),hidden:false})}>{t('hidden.restore',{title:frame.title})}</button>)}</div></details>}
  {state.presenting&&<nav className="presentation-controls"><button onClick={leavePresentation}><ArrowLeft/>{t('present.canvas')} <kbd>Esc</kbd></button><span>{workspace.experiment.frames.find(frame=>frame.id===state.presenting)?.title}</span><NextSteps frameId={state.presenting}/><button aria-label={t('present.fullscreen')} onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>update({error:t('present.fullscreenUnavailable')}));}}><Maximize/></button><button onClick={()=>update({comments:!state.comments,inspector:false})}>{t('present.feedback')}</button></nav>}
  {state.mode==='element'&&<div className="mode-hint">{t('hint.inspect')}<button onClick={()=>setMode('interact')}>{t('hint.done')}</button></div>}
  {state.mode==='comment'&&<div className="mode-hint">{t('hint.comment')}<button onClick={()=>setMode('interact')}>{t('hint.done')}</button></div>}
  {(state.notice||state.error||workspace.diagnostics.length>0)&&<div className="notice" role="alert">{[state.notice, state.error ?? workspace.diagnostics.join(' · ')].filter(Boolean).join(' · ')}{state.error&&<button onClick={()=>void discardLayoutConflict()}>{t('notice.reloadLayout')}</button>}{state.notice&&!state.error&&<button onClick={()=>update({notice:undefined})}>{t('notice.close')}</button>}</div>}
  <MiniMap/><ConnectionControls/><Info/><InspectorPanel/><Comments/><NewFrame/><Compare/>
 </main>;
}
const root=document.getElementById('root'); if(root) createRoot(root).render(<App/>);
void initialize();
