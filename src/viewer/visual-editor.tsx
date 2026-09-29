import {useEffect, useState, type Dispatch, type SetStateAction, type ChangeEvent} from 'react';
import type {Target} from '../protocol';
import {t, type MessageKey} from '../i18n';
import {activeClaim, iframes, mutate, snapshot} from './store';

type Styles = Record<string,string>;
interface EditorState {styles:Styles; changes:Styles; text?:string; changedText?:string; editableText:boolean; ready:boolean; error?:string; saved:boolean}
interface EditorContext {frameId:string; target:Target; state:EditorState; setState:Dispatch<SetStateAction<EditorState>>}
const EMPTY_STATE:EditorState={styles:{},changes:{},editableText:false,ready:false,saved:false};
const NUMERIC_FIELDS=[['fontSize','editor.fontSize'],['lineHeight','editor.lineHeight'],['padding','editor.padding'],['margin','editor.margin'],['borderRadius','editor.borderRadius']] as const;
const SELECT_FIELDS:Record<string,{label:MessageKey;values:string[]}>={fontWeight:{label:'editor.fontWeight',values:['100','200','300','400','500','600','700','800','900','normal','bold']}};
function post(frameId:string,message:unknown) {iframes.get(frameId)?.contentWindow?.postMessage(message,'*');}
function subscribeStyles(frameId:string,target:Target,setState:Dispatch<SetStateAction<EditorState>>) {
 setState(EMPTY_STATE);
 function receive(event:MessageEvent<unknown>) {
  if(event.source!==iframes.get(frameId)?.contentWindow||!event.data||typeof event.data!=='object')return;
  const message=event.data;
  if(!('type' in message)||message.type!=='draftroom:styles'||!('selector' in message)||message.selector!==target.selector||!('styles' in message)||!message.styles||typeof message.styles!=='object')return;
  const styles:Styles={};
  for(const [name,value] of Object.entries(message.styles))if(typeof value==='string')styles[name]=value;
  setState(previous=>({...previous,styles,text:'text' in message&&typeof message.text==='string'?message.text:undefined,editableText:'editableText' in message&&message.editableText===true,ready:true,error:'error' in message&&typeof message.error==='string'?message.error:undefined}));
 }
 window.addEventListener('message',receive);
 post(frameId,{type:'draftroom:inspect',selector:target.selector});
 return ()=>{window.removeEventListener('message',receive);post(frameId,{type:'draftroom:revert'});};
}
function changeStyle(context:EditorContext,name:string,value:string) {
 const changes={...context.state.changes,[name]:value};
 context.setState({...context.state,changes,saved:false,error:undefined});
 post(context.frameId,{type:'draftroom:preview',selector:context.target.selector,styles:changes,text:context.state.changedText});
}
function changeNumber(context:EditorContext,name:string,event:ChangeEvent<HTMLInputElement>) {
 if(event.currentTarget.value==='')return;
 changeStyle(context,name,`${event.currentTarget.value}px`);
}
function changeText(context:EditorContext,event:ChangeEvent<HTMLTextAreaElement>) {
 const changedText=event.currentTarget.value;
 context.setState({...context.state,changedText,saved:false,error:undefined});
 post(context.frameId,{type:'draftroom:preview',selector:context.target.selector,styles:context.state.changes,text:changedText});
}
function reset(context:EditorContext) {post(context.frameId,{type:'draftroom:revert'});context.setState({...context.state,changes:{},changedText:undefined,saved:false,error:undefined});}
async function save(context:EditorContext) {
 await mutate('edits',{frameId:context.frameId,selector:context.target.selector,styles:context.state.changes,...(context.state.changedText===undefined?{}:{text:context.state.changedText})});
 if(snapshot().error)return;
 context.setState(previous=>({...previous,changes:{},changedText:undefined,saved:true}));
}
async function restoreOriginal(context:EditorContext) {
 await mutate('edits',{frameId:context.frameId,selector:context.target.selector,remove:true});
 if(!snapshot().error)context.setState(previous=>({...previous,changes:{},changedText:undefined,saved:false}));
}
function numericValue(value?:string) {if(!value||!/^[-\d.]+px$/.test(value))return '';return parseFloat(value);}
export function VisualEditor({frameId,target}:{frameId:string;target:Target}) {
 const [state,setState]=useState<EditorState>(EMPTY_STATE);
 const claim = activeClaim(frameId);
 useEffect(()=>{ if (claim) return; return subscribeStyles(frameId,target,setState); },[frameId,target.selector,claim?.id]);
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
   {state.saved&&<p role="status">{t('editor.saved')}</p>}
   <footer className="editor-actions"><button type="button" onClick={()=>reset(context)} disabled={!Object.keys(state.changes).length&&state.changedText===undefined}>{t('editor.undoPreview')}</button><button type="button" className="primary" disabled={snapshot().busy||!!state.error||(!Object.keys(state.changes).length&&state.changedText===undefined)} onClick={()=>void save(context)}>{t('editor.save')}</button></footer>
   <button type="button" className="restore-original" onClick={()=>void restoreOriginal(context)}>{t('editor.restore')}</button>

  </>}
 </section>;
}
