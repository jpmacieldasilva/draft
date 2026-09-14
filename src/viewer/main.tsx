import { useSyncExternalStore, type PointerEvent, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { MousePointer2, Scan, Info as InfoIcon, Play, MoreHorizontal, ChevronDown, X, Plus, Minus, Maximize, ArrowLeft, MessageSquare, MoveDiagonal } from 'lucide-react';
import { FlowConnections, MiniMap, ConnectionControls, FrameConnector } from './flow-canvas';
import { VisualEditor } from './visual-editor';
import { Button } from '@astryxdesign/core/Button';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './style.css';
import type { Frame, Position } from '../protocol';
import { subscribe, snapshot, update, initialize, framePosition, iframes, setPosition, saveLayout, setLayout, fit, zoomBy, setMode, present, leavePresentation, syncBridge, selectTarget, mutate, refresh, discardLayoutConflict } from './store';
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
 return <details className="viewport-menu"><summary aria-label={`Viewport de ${frame.title}`} title="Ajustar viewport">{position.width} × {position.height}</summary><div className="menu viewport-panel"><strong>Viewport</strong><form key={`${position.width}:${position.height}`} onSubmit={event=>resizeViewport(event,frame)}><div className="viewport-fields"><label>Largura<input name="width" type="number" min="160" max="4000" defaultValue={position.width}/></label><label>Altura<input name="height" type="number" min="120" max="4000" defaultValue={position.height}/></label></div><button type="submit" disabled={state.workspace?.readOnly}>Aplicar tamanho</button></form><div className="viewport-presets">{[{label:'Celular',width:390,height:844},{label:'Tablet',width:768,height:1024},{label:'Desktop',width:1440,height:900}].map(preset=><button key={preset.label} disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,width:preset.width,height:preset.height})}>{preset.label}</button>)}</div><button disabled={state.workspace?.readOnly} onClick={()=>setPosition(frame.id,{...position,...frame.viewport})}>Restaurar tamanho original</button></div></details>;
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
 return <div className="scrim" onClick={()=>update({newFrame:false})}><section role="dialog" aria-modal="true" aria-label="Adicionar protótipo" className="info-sheet create-sheet" onClick={event=>event.stopPropagation()}><button className="close" aria-label="Fechar criação" onClick={()=>update({newFrame:false})}><X/></button><p className="muted">Nova alternativa</p><h1>Adicionar protótipo</h1><p className="create-copy">Crie um frame vazio para começar uma nova direção. O Draftroom cuida da pasta e do manifesto.</p><form onSubmit={submit} className="create-form"><label>Nome da alternativa<input autoFocus name="title" placeholder="Ex.: Mais compacto" maxLength={200} required/></label><div className="create-actions"><button type="button" onClick={()=>update({newFrame:false})}>Cancelar</button><button className="primary" type="submit" disabled={state.busy}>Criar protótipo</button></div></form></section></div>;
}
function FrameView({frame}:{frame:Frame}) {
 const state=useStore(), position=framePosition(frame), presenting=state.presenting===frame.id;
 const comments=state.workspace?.feedback.filter(comment=>comment.frameId===frame.id) ?? [];
 return <article className={`frame ${presenting?'presenting':''} ${state.selected===frame.id?'selected':''}`} style={{left:position.x,top:position.y,width:position.width,height:position.height+44,display:position.hidden&&!presenting?'none':undefined}} aria-label={frame.title} data-frame-id={frame.id}>
  <header className="frame-header" onPointerDown={event=>startMove(event,frame)}>
   <button className="frame-title" onClick={()=>update({selected:frame.id})}>{frame.title}</button><ViewportControls frame={frame}/>
   <button className="icon-button" aria-label={`Informações de ${frame.title}`} title="Informações" onClick={()=>update({info:frame.id})}><InfoIcon/></button>
   <button className="icon-button" aria-label={`Apresentar ${frame.title}`} title="Apresentar" onClick={()=>present(frame.id)}><Play/></button>
   {!state.workspace?.readOnly&&<details className="frame-menu"><summary aria-label={`Opções de ${frame.title}`}><MoreHorizontal/></summary><div className="menu">
    <form onSubmit={event=>renameFrame(event,frame.id)}><label>Novo título<input name="title" defaultValue={frame.title} required maxLength={120}/></label><button type="submit">Renomear</button></form>
    <button onClick={()=>void mutate(`frames/${encodeURIComponent(frame.id)}/duplicate`,{})}>Duplicar alternativa</button>
    <button onClick={()=>setPosition(frame.id,{...position,hidden:true})}>Ocultar do canvas</button>
   </div></details>}
  </header>
  <div className="frame-content">
   {frame.error ? <div className="frame-error"><h2>Este frame precisa de atenção</h2><p>{frame.error}</p><button onClick={()=>void refresh()}>Tentar novamente</button></div> : <iframe ref={element=>{if(element) iframes.set(frame.id,element);else iframes.delete(frame.id);}} src={frame.url ?? `./content/${frame.entry}`} title={frame.title} sandbox="allow-scripts" onLoad={()=>syncBridge(frame.id)}/>}
   {comments.filter(comment=>comment.status==='open').map((comment,index)=><button key={comment.id} className={`pin ${state.feedback===comment.id?'active':''}`} style={{left:comment.target.rect.x,top:comment.target.rect.y}} title={comment.message} aria-label={`Comentário ${index+1}: ${comment.message}`} onClick={()=>update({feedback:comment.id,comments:true,target:undefined,selected:frame.id})}>{index+1}</button>)}
   {state.target?.frameId===frame.id&&state.target.target.kind==='region'&&<div className="selection" style={{left:state.target.target.rect.x,top:state.target.target.rect.y,width:state.target.target.rect.width,height:state.target.target.rect.height}}/>}
  </div>
  {!state.workspace?.readOnly&&<div className="resize" title="Arraste para redimensionar" role="separator" tabIndex={0} aria-label={`Redimensionar ${frame.title}`} onPointerDown={event=>startMove(event,frame,true)}><MoveDiagonal/></div>}
  {!state.workspace?.readOnly&&!presenting&&<FrameConnector frameId={frame.id}/>}
 </article>;
}
function Info() {
 const state=useStore(); if(!state.info) return null;
 const frame=state.workspace?.experiment.frames.find(frame=>frame.id===state.info);
 return <div className="scrim" onClick={()=>update({info:undefined})}><section role="dialog" aria-modal="true" aria-label="Informações" className="info-sheet" onClick={event=>event.stopPropagation()}><button className="close" aria-label="Fechar informações" onClick={()=>update({info:undefined})}><X/></button><p className="muted">{frame?'Sobre este protótipo':'Sobre este espaço'}</p><h1>{frame?.title ?? state.workspace?.experiment.title}</h1><div className="readme">{frame?.readme ?? (frame?'Sem README.md para este frame.':state.workspace?.readme || 'Adicione um README.md à pasta para dar contexto ao trabalho.')}</div>{frame&&<Button label="Apresentar protótipo" onClick={()=>present(frame.id)}/>}</section></div>;
}
function Comments() {
 const state=useStore(); if(!state.comments) return null;
 const comments=state.workspace?.feedback.filter(comment=>!state.selected||comment.frameId===state.selected) ?? [];
 return <aside className="comments" aria-label="Feedback visual"><header><h2>{state.target?'Inspector':'Comentários'}</h2><button aria-label="Fechar feedback" onClick={()=>update({comments:false,target:undefined})}><X/></button></header>
  {state.target?.target.kind==='element'&&<VisualEditor key={`${state.target.frameId}:${state.target.target.selector}`} frameId={state.target.frameId} target={state.target.target}/>}
  {state.target&&<form onSubmit={submitFeedback} className="comment-compose"><span className="muted">{state.target.target.kind==='region'?'Região':'Elemento'} selecionado</span><strong>{state.target.target.label}</strong><code>{Math.round(state.target.target.rect.width)} × {Math.round(state.target.target.rect.height)} px</code><label>O que precisa mudar?<textarea autoFocus name="message" required maxLength={8000} placeholder="Descreva sua intenção…"/></label><button className="primary" disabled={state.busy} type="submit">Salvar comentário</button></form>}
  {!comments.length&&!state.target&&<p className="empty-copy">Selecione um elemento ou marque uma região para iniciar a revisão.</p>}
  <div className="comment-list">{comments.map(comment=><section key={comment.id} className={`comment ${comment.status==='resolved'?'resolved':''} ${state.feedback===comment.id?'focused':''}`}><span className="muted">{state.workspace?.experiment.frames.find(frame=>frame.id===comment.frameId)?.title}</span><strong>{comment.target.label}</strong><p>{comment.message}</p><footer><span>{comment.status==='resolved'?'Resolvido':'Aberto'}</span>{!state.workspace?.readOnly&&<button onClick={()=>void mutate(`feedback/${encodeURIComponent(comment.id)}`,{status:comment.status==='open'?'resolved':'open'})}>{comment.status==='open'?'Resolver':'Reabrir'}</button>}</footer></section>)}</div>
 </aside>;
}
function App() {
 const state=useStore(),workspace=state.workspace;
 if(!workspace) return <main className="loading"><span className="brand">Draftroom<span>✳</span></span><p>{state.error ?? 'Abrindo seu espaço…'}</p>{state.error&&<Button label="Tentar novamente" onClick={()=>void refresh()}/>}</main>;
 const hidden=workspace.experiment.frames.filter(frame=>framePosition(frame).hidden);
 return <main className={state.presenting?'app is-presenting':'app'}>
  <header className="topbar"><div className="identity"><span className="brand">Draftroom<span>✳</span></span><span className="divider"/><button className="workspace-title" onClick={()=>update({info:'workspace'})}>{workspace.experiment.title}<ChevronDown/></button></div><div className="topbar-end"><span className="save-state" role="status">{workspace.readOnly?'Somente leitura':state.busy?'Salvando…':''}</span>{!workspace.readOnly&&<button className="add-frame" onClick={()=>update({newFrame:true})}><Plus/>Adicionar protótipo</button>}<button className="feedback-toggle" onClick={()=>update({comments:!state.comments,selected:undefined})}><MessageSquare/>Comentários <span>{workspace.feedback.filter(comment=>comment.status==='open').length}</span></button></div></header>
  <div className="canvas" style={{backgroundSize:`${24*state.layout.zoom}px ${24*state.layout.zoom}px`,backgroundPosition:`${state.layout.x}px ${state.layout.y}px`}} onPointerDown={startPan} onWheel={event=>{if(event.target!==event.currentTarget)return;if(event.ctrlKey||event.metaKey){event.preventDefault();zoomBy(event.deltaY>0?.94:1.06);}else setLayout({...state.layout,x:state.layout.x-event.deltaX,y:state.layout.y-event.deltaY});}}>
   <div className="world" style={{transform:state.presenting?'none':`translate(${state.layout.x}px,${state.layout.y}px) scale(${state.layout.zoom})`}}><FlowConnections/>{workspace.experiment.frames.map(frame=><FrameView key={frame.id} frame={frame}/>)}</div>
   {workspace.experiment.frames.length===0&&<div className="empty-canvas"><h1>Um espaço para suas ideias.</h1><p>Adicione protótipos para começar.</p></div>}
  </div>
  <nav className="toolbar" aria-label="Ferramentas do canvas"><button className={state.mode==='interact'?'active':''} title="Interagir com os protótipos" onClick={()=>setMode('interact')} aria-pressed={state.mode==='interact'}><MousePointer2/><span>Interagir</span></button>{!workspace.readOnly&&<><button className={state.mode==='element'?'active':''} onClick={()=>setMode('element')} aria-pressed={state.mode==='element'}><Scan/><span>Inspecionar</span></button></>}<span className="divider"/><button aria-label="Diminuir zoom" onClick={()=>zoomBy(1/1.15)}><Minus/></button><button className="zoom" title="Centralizar (0)" onClick={fit}>{Math.round(state.layout.zoom*100)}%</button><button aria-label="Aumentar zoom" onClick={()=>zoomBy(1.15)}><Plus/></button><button title="Centralizar (0)" aria-label="Centralizar frames" onClick={fit}><Maximize/></button></nav>
  {!!hidden.length&&<details className="hidden-frames"><summary>{hidden.length} oculto{hidden.length>1?'s':''}</summary><div className="menu">{hidden.map(frame=><button key={frame.id} onClick={()=>setPosition(frame.id,{...framePosition(frame),hidden:false})}>Restaurar {frame.title}</button>)}</div></details>}
  {state.presenting&&<nav className="presentation-controls"><button onClick={leavePresentation}><ArrowLeft/>Canvas <kbd>Esc</kbd></button><span>{workspace.experiment.frames.find(frame=>frame.id===state.presenting)?.title}</span><button aria-label="Tela cheia" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>update({error:'Tela cheia indisponível neste navegador.'}));}}><Maximize/></button><button onClick={()=>update({comments:!state.comments})}>Feedback</button></nav>}
  {state.mode!=='interact'&&<div className="mode-hint">{'Clique para editar um elemento. Arraste para comentar uma região.'}<button onClick={()=>setMode('interact')}>Concluir</button></div>}
  {(state.error||workspace.diagnostics.length>0)&&<div className="notice" role="alert">{state.error ?? workspace.diagnostics.join(' · ')}{state.error&&<button onClick={()=>void discardLayoutConflict()}>Recarregar composição salva</button>}</div>}
  <MiniMap/><ConnectionControls/><Info/><Comments/><NewFrame/>
 </main>;
}
const root=document.getElementById('root'); if(root) createRoot(root).render(<App/>);
void initialize();
