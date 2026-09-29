import {useEffect, useRef, useState, type Dispatch, type SetStateAction, type ChangeEvent} from 'react';
import {Check} from 'lucide-react';
import type {Target} from '../protocol';
import {t, type MessageKey} from '../i18n';
import {activeClaim, addEscapeLayer, iframes, mutate, snapshot} from './store';

type Styles = Record<string,string>;
interface SavedEdit {file:string; styles:Record<string,{before:string;after:string;expected:string}>; text?:{before:string;after:string}}
type Outcome = {kind:'saved';edit:SavedEdit} | {kind:'undone'|'restored';file:string} | {kind:'stale'};
interface EditorState {styles:Styles; base:Styles; changes:Styles; text?:string; baseText?:string; changedText?:string; editableText:boolean; ready:boolean; error?:string; outcome?:Outcome; confirming:boolean}
interface Sync {fresh:boolean; state:EditorState}
interface EditorContext {frameId:string; target:Target; state:EditorState; setState:Dispatch<SetStateAction<EditorState>>}
const EMPTY_STATE:EditorState={styles:{},base:{},changes:{},editableText:false,ready:false,confirming:false};
const NUMERIC_FIELDS=[['fontSize','editor.fontSize'],['lineHeight','editor.lineHeight'],['padding','editor.padding'],['margin','editor.margin'],['borderRadius','editor.borderRadius']] as const;
const SELECT_FIELDS:Record<string,{label:MessageKey;values:string[]}>={fontWeight:{label:'editor.fontWeight',values:['100','200','300','400','500','600','700','800','900','normal','bold']}};
function post(frameId:string,message:unknown) {iframes.get(frameId)?.contentWindow?.postMessage(message,'*');}
function pending(state:EditorState) {return Object.keys(state.changes).length>0||state.changedText!==undefined;}
function frameFile(frameId:string) {return snapshot().workspace?.experiment.frames.find(frame=>frame.id===frameId)?.entry.replace(/\\/g,'/')??'';}
function subscribeStyles(frameId:string,target:Target,setState:Dispatch<SetStateAction<EditorState>>,sync:Sync) {
 setState(EMPTY_STATE);
 function receive(event:MessageEvent<unknown>) {
  if(event.source!==iframes.get(frameId)?.contentWindow||!event.data||typeof event.data!=='object')return;
  const message=event.data;
  if('type' in message&&message.type==='draftroom:ready') {
   sync.fresh=true;
   post(frameId,{type:'draftroom:inspect',selector:target.selector});
   if(pending(sync.state))post(frameId,{type:'draftroom:preview',selector:target.selector,styles:sync.state.changes,text:sync.state.changedText});
   return;
  }
  if(!('type' in message)||message.type!=='draftroom:styles'||!('selector' in message)||message.selector!==target.selector||!('styles' in message)||!message.styles||typeof message.styles!=='object')return;
  const styles:Styles={};
  for(const [name,value] of Object.entries(message.styles))if(typeof value==='string')styles[name]=value;
  const text='text' in message&&typeof message.text==='string'?message.text:undefined;
  const fromFile=sync.fresh; sync.fresh=false;
  setState(previous=>{
   const isBase=fromFile||!pending(previous);
   return {...previous,styles,text,base:isBase?styles:previous.base,baseText:isBase?text:previous.baseText,editableText:'editableText' in message&&message.editableText===true,ready:true,error:'error' in message&&typeof message.error==='string'?message.error:undefined};
  });
 }
 window.addEventListener('message',receive);
 post(frameId,{type:'draftroom:inspect',selector:target.selector});
 return ()=>{window.removeEventListener('message',receive);post(frameId,{type:'draftroom:revert'});};
}
function changeStyle(context:EditorContext,name:string,value:string) {
 const changes={...context.state.changes,[name]:value};
 context.setState({...context.state,changes,outcome:undefined,confirming:false,error:undefined});
 post(context.frameId,{type:'draftroom:preview',selector:context.target.selector,styles:changes,text:context.state.changedText});
}
function changeNumber(context:EditorContext,name:string,event:ChangeEvent<HTMLInputElement>) {
 if(event.currentTarget.value==='')return;
 changeStyle(context,name,`${event.currentTarget.value}px`);
}
function changeText(context:EditorContext,event:ChangeEvent<HTMLTextAreaElement>) {
 const changedText=event.currentTarget.value;
 context.setState({...context.state,changedText,outcome:undefined,confirming:false,error:undefined});
 post(context.frameId,{type:'draftroom:preview',selector:context.target.selector,styles:context.state.changes,text:changedText});
}
function reset(context:EditorContext) {post(context.frameId,{type:'draftroom:revert'});context.setState({...context.state,changes:{},changedText:undefined,outcome:undefined,error:undefined});}
async function save(context:EditorContext) {
 const {state}=context;
 const edit:SavedEdit={
  file:frameFile(context.frameId),
  styles:Object.fromEntries(Object.entries(state.changes).map(([name,after])=>[name,{before:state.base[name]??'',after,expected:state.styles[name]??after}])),
  ...(state.changedText===undefined?{}:{text:{before:state.baseText??'',after:state.changedText}})
 };
 await mutate('edits',{frameId:context.frameId,selector:context.target.selector,styles:state.changes,...(state.changedText===undefined?{}:{text:state.changedText})});
 if(snapshot().error)return;
 context.setState(previous=>({...previous,base:previous.styles,baseText:previous.text,changes:{},changedText:undefined,outcome:{kind:'saved',edit}}));
}
/** Writes back the values the element showed before this save. Refuses when the file no longer holds what this save wrote. */
async function undo(context:EditorContext,edit:SavedEdit) {
 const {state}=context;
 const changedSince=Object.entries(edit.styles).some(([name,value])=>state.base[name]!==value.expected)||(!!edit.text&&state.baseText!==edit.text.after);
 if(changedSince){context.setState(previous=>({...previous,outcome:{kind:'stale'}}));return;}
 await mutate('edits',{frameId:context.frameId,selector:context.target.selector,styles:Object.fromEntries(Object.entries(edit.styles).map(([name,value])=>[name,value.before])),...(edit.text?{text:edit.text.before}:{})});
 if(snapshot().error)return;
 context.setState(previous=>({...previous,outcome:{kind:'undone',file:edit.file}}));
}
async function restoreOriginal(context:EditorContext) {
 await mutate('edits',{frameId:context.frameId,selector:context.target.selector,remove:true});
 if(snapshot().error){context.setState(previous=>({...previous,confirming:false}));return;}
 post(context.frameId,{type:'draftroom:revert'});
 context.setState(previous=>({...previous,changes:{},changedText:undefined,confirming:false,outcome:{kind:'restored',file:frameFile(context.frameId)}}));
}
function numericValue(value?:string) {if(!value||!/^[-\d.]+px$/.test(value))return '';return parseFloat(value);}
function withFile(key:MessageKey,file:string) {const [before,after='']=t(key).split('{file}');return <>{before}<code>{file}</code>{after}</>;}
function clip(value:string) {const text=value.trim().replace(/\s+/g,' ');return text.length>28?`${text.slice(0,27)}…`:text;}
function changeLines(edit:SavedEdit) {
 const lines=Object.entries(edit.styles).map(([name,value])=>`${name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)} ${value.before} → ${value.after}`);
 if(edit.text)lines.push(t('editor.textChange',{before:clip(edit.text.before),after:clip(edit.text.after)}));
 return lines;
}
function OutcomeMessage({context}:{context:EditorContext}) {
 const outcome=context.state.outcome;
 if(!outcome)return null;
 if(outcome.kind==='stale')return <p className="editor-outcome-error" role="alert">{t('editor.undoStale')}</p>;
 if(outcome.kind!=='saved')return <div className="editor-outcome"><p role="status"><Check aria-hidden="true"/><span>{withFile(outcome.kind==='undone'?'editor.undone':'editor.restored',outcome.file)}</span></p></div>;
 return <div className="editor-outcome">
  <div role="status"><p><Check aria-hidden="true"/><span>{withFile('editor.savedIn',outcome.edit.file)}</span></p><ul className="editor-diff">{changeLines(outcome.edit).map(line=><li key={line}>{line}</li>)}</ul></div>
  <button type="button" className="editor-undo" disabled={snapshot().busy} onClick={()=>void undo(context,outcome.edit)}>{t('editor.undo')}</button>
 </div>;
}
export function VisualEditor({frameId,target}:{frameId:string;target:Target}) {
 const [state,setState]=useState<EditorState>(EMPTY_STATE);
 const sync=useRef<Sync>({fresh:false,state});
 sync.current.state=state;
 const restoreButton=useRef<HTMLButtonElement>(null);
 const wasConfirming=useRef(false);
 const claim = activeClaim(frameId);
 useEffect(()=>{ if (claim) return; return subscribeStyles(frameId,target,setState,sync.current); },[frameId,target.selector,claim?.id]);
 useEffect(()=>addEscapeLayer(()=>{ if(!sync.current.state.confirming)return false; setState(previous=>({...previous,confirming:false})); return true; }),[]);
 useEffect(()=>{ if(wasConfirming.current&&!state.confirming)restoreButton.current?.focus(); wasConfirming.current=state.confirming; },[state.confirming]);
 const context={frameId,target,state,setState};
 if(target.kind!=='element')return null;
 if (claim) {
  return <section className="visual-editor agent-locked" aria-label={t('editor.lockedLabel')}>
   <header className="editor-header"><span className="selection-indicator locked" aria-hidden="true"/><div><span className="editor-eyebrow">{t('frame.agent')}</span><strong>{claim.label}</strong></div></header>
   <p className="editor-lock" role="status" title={t('frame.agentHere')}>{t('editor.locked')}</p>
  </section>;
 }
 return <section className="visual-editor" aria-label={t('editor.label')}>
  <header className="editor-header"><span className="selection-indicator" aria-hidden="true"/><div><span className="editor-eyebrow">{t('editor.selected')}</span><strong>{target.label}</strong></div></header>
  {!state.ready&&<p className="editor-loading" role="status">{t('editor.loading')}</p>}
  {state.ready&&<>
   {state.editableText&&<label className="editor-text">{t('editor.text')}<textarea aria-label={t('editor.text')} value={state.changedText??state.text??''} rows={2} maxLength={8000} onChange={event=>changeText(context,event)}/></label>}
   {[
    {title:t('editor.typography'),names:['fontSize','lineHeight','fontWeight'],open:true},
    {title:t('editor.appearance'),names:['color','backgroundColor','borderRadius'],open:false},
    {title:t('editor.spacing'),names:['padding','margin'],open:false}
   ].map(group=><details className="editor-group" key={group.title} open={group.open}><summary>{group.title}</summary><div className="editor-fields">
    {group.names.filter(name=>name==='color'||name==='backgroundColor').map(name=><label key={name}>{t(name==='color'?'editor.textColor':'editor.backgroundColor')}<input aria-label={t(name==='color'?'editor.textColor':'editor.backgroundColor')} value={state.changes[name]??state.styles[name]??''} placeholder="#334455" onChange={event=>changeStyle(context,name,event.currentTarget.value)}/></label>)}
    {NUMERIC_FIELDS.filter(([name])=>group.names.includes(name)).map(([name,label])=><label key={name}>{t(label)} (px)<input type="number" min={name==='margin'?-500:0} max={500} step="1" placeholder={t('editor.auto')} value={numericValue(state.changes[name]??state.styles[name])} onChange={event=>changeNumber(context,name,event)}/></label>)}
    {Object.entries(SELECT_FIELDS).filter(([name])=>group.names.includes(name)).map(([name,field])=><label key={name}>{t(field.label)}<select value={state.changes[name]??state.styles[name]??''} onChange={event=>changeStyle(context,name,event.currentTarget.value)}>{!field.values.includes(state.styles[name])&&<option value={state.styles[name]??''}>{state.styles[name]??t('editor.default')}</option>}{field.values.map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}
   </div></details>)}
   {state.error&&<p role="alert">{state.error}</p>}
   <p className="editor-target">{withFile('editor.target',frameFile(frameId))}</p>
   <footer className="editor-actions"><button type="button" onClick={()=>reset(context)} disabled={!pending(state)}>{t('editor.discard')}</button><button type="button" className="primary" disabled={snapshot().busy||!!state.error||!pending(state)} onClick={()=>void save(context)}>{t('editor.save')}</button></footer>
   <OutcomeMessage context={context}/>
   {state.confirming
    ?<div className="editor-confirm" role="group" aria-label={t('editor.restore')}><p>{t('editor.restoreConfirm')}</p><div><button type="button" autoFocus onClick={()=>setState(previous=>({...previous,confirming:false}))}>{t('editor.restoreCancel')}</button><button type="button" className="danger" disabled={snapshot().busy} onClick={()=>void restoreOriginal(context)}>{t('editor.restoreRemove')}</button></div></div>
    :<button type="button" ref={restoreButton} className="restore-original" onClick={()=>setState(previous=>({...previous,confirming:true,outcome:undefined}))}>{t('editor.restore')}</button>}
  </>}
 </section>;
}
