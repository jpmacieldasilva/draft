import {useEffect, useState, type Dispatch, type SetStateAction, type ChangeEvent} from 'react';
import type {Target} from '../protocol';
import {iframes, mutate, snapshot} from './store';

type Styles = Record<string,string>;
interface EditorState {styles:Styles; changes:Styles; text?:string; changedText?:string; editableText:boolean; ready:boolean; error?:string; saved:boolean}
interface EditorContext {frameId:string; target:Target; state:EditorState; setState:Dispatch<SetStateAction<EditorState>>}
const EMPTY_STATE:EditorState={styles:{},changes:{},editableText:false,ready:false,saved:false};
const NUMERIC_FIELDS=[['fontSize','Tamanho do texto'],['lineHeight','Altura de linha'],['padding','Espaço interno'],['margin','Margem'],['borderRadius','Raio dos cantos']];
const SELECT_FIELDS:Record<string,{label:string;values:string[]}>={fontWeight:{label:'Peso do texto',values:['100','200','300','400','500','600','700','800','900','normal','bold']}};
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
 useEffect(()=>subscribeStyles(frameId,target,setState),[frameId,target.selector]);
 const context={frameId,target,state,setState};
 if(target.kind!=='element')return null;
 return <section className="visual-editor" aria-label="Editar elemento">
  <header className="editor-header"><span className="selection-indicator" aria-hidden="true"/><div><span className="editor-eyebrow">Selecionado</span><strong>{target.label}</strong></div></header>
  {!state.ready&&<p className="editor-loading" role="status">Lendo propriedades do elemento…</p>}
  {state.ready&&<>
   {state.editableText&&<label className="editor-text">Texto<textarea aria-label="Texto" value={state.changedText??state.text??''} rows={2} maxLength={8000} onChange={event=>changeText(context,event)}/></label>}
   {[
    {title:'Tipografia',names:['fontSize','lineHeight','fontWeight'],open:true},
    {title:'Aparência',names:['color','backgroundColor','borderRadius'],open:false},
    {title:'Espaçamento',names:['padding','margin'],open:false}
   ].map(group=><details className="editor-group" key={group.title} open={group.open}><summary>{group.title}</summary><div className="editor-fields">
    {group.names.filter(name=>name==='color'||name==='backgroundColor').map(name=><label key={name}>{name==='color'?'Cor do texto':'Cor de fundo'}<input aria-label={name==='color'?'Cor do texto':'Cor de fundo'} value={state.changes[name]??state.styles[name]??''} placeholder="#334455" onChange={event=>changeStyle(context,name,event.currentTarget.value)}/></label>)}
    {NUMERIC_FIELDS.filter(([name])=>group.names.includes(name)).map(([name,label])=><label key={name}>{label} (px)<input type="number" min={name==='margin'?-500:0} max={name==='width'||name==='height'?10000:500} step="1" placeholder="Automático" value={numericValue(state.changes[name]??state.styles[name])} onChange={event=>changeNumber(context,name,event)}/></label>)}
    {Object.entries(SELECT_FIELDS).filter(([name])=>group.names.includes(name)).map(([name,field])=><label key={name}>{field.label}<select value={state.changes[name]??state.styles[name]??''} onChange={event=>changeStyle(context,name,event.currentTarget.value)}>{!field.values.includes(state.styles[name])&&<option value={state.styles[name]??''}>{state.styles[name]??'Padrão'}</option>}{field.values.map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}
   </div></details>)}
   {state.error&&<p role="alert">{state.error}</p>}
   {state.saved&&<p role="status">Ajuste salvo.</p>}
   <footer className="editor-actions"><button type="button" onClick={()=>reset(context)} disabled={!Object.keys(state.changes).length&&state.changedText===undefined}>Desfazer prévia</button><button type="button" className="primary" disabled={snapshot().busy||!!state.error||(!Object.keys(state.changes).length&&state.changedText===undefined)} onClick={()=>void save(context)}>Salvar ajuste</button></footer>
   <button type="button" className="restore-original" onClick={()=>void restoreOriginal(context)}>Restaurar original</button>

  </>}
 </section>;
}
