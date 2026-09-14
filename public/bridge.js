(() => {
  let mode = 'interact', outline, dragging, selected, originals = new Map(), managed = new Map(), overridesKey = '';
  const limits = {fontSize:[1,300],lineHeight:[0,500],padding:[0,500],margin:[-500,500],borderRadius:[0,500],gap:[0,500],width:[1,10000],height:[1,10000]};
  const choices = {fontWeight:['100','200','300','400','500','600','700','800','900','normal','bold'],display:['block','inline','inline-block','flex','grid','none'],alignItems:['normal','stretch','start','end','center','baseline'],justifyContent:['normal','start','end','center','space-between','space-around','space-evenly']};
  const properties = ['color','backgroundColor',...Object.keys(limits),...Object.keys(choices)];
  function clear() { if(outline) outline.remove(); outline=undefined; }
  function paint(rect) {
    if(!outline) { outline=document.createElement('div'); outline.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #4769e8;background:rgba(71,105,232,.07);box-sizing:border-box'; document.documentElement.append(outline); }
    Object.assign(outline.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
  }
  function selector(element) {
    if(element.id) return '#'+CSS.escape(element.id);
    if(element.dataset.draftroomId) return '[data-draftroom-id="'+CSS.escape(element.dataset.draftroomId)+'"]';
    const parts=[]; let current=element;
    while(current && current!==document.body) {
      const siblings=current.parentElement ? [...current.parentElement.children].filter(sibling=>sibling.tagName===current.tagName) : [];
      parts.unshift(current.tagName.toLowerCase()+(siblings.length>1?':nth-of-type('+(siblings.indexOf(current)+1)+')':'')); current=current.parentElement;
    }
    return parts.length?'body > '+parts.join(' > '):'body';
  }
  function find(query) { if(typeof query!=='string'||query.length>4000) return; try { const element=document.querySelector(query); return element instanceof HTMLElement && element!==outline?element:undefined; } catch { return; } }
  function validStyles(styles) {
    if(!styles||typeof styles!=='object'||Array.isArray(styles)) return false;
    return Object.entries(styles).every(([name,value])=>{
      if(typeof value!=='string'||value.length>100||!properties.includes(name)) return false;
      if(name==='color'||name==='backgroundColor') return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i.test(value)&&CSS.supports('color',value);
      if(choices[name]) return choices[name].includes(value);
      const number=Number(value.replace(/px$/,'')); return /^-?\d+(\.\d+)?px$/.test(value)&&Number.isFinite(number)&&number>=limits[name][0]&&number<=limits[name][1];
    });
  }
  function report(element, error) {
    const computed=getComputedStyle(element);
    parent.postMessage({type:'draftroom:styles',selector:selector(element),styles:Object.fromEntries(properties.map(name=>[name,computed[name]])),text:element.childElementCount===0?element.textContent:undefined,editableText:element.childElementCount===0,error},'*');
  }
  function revert() { originals.forEach((original,element)=>{ if(original.style===null) element.removeAttribute('style'); else element.setAttribute('style',original.style); if(original.text!==undefined) element.textContent=original.text; }); originals=new Map(); }
  function apply(change, preview) {
    const element=find(change.selector);
    if(!element) return;
    if(!validStyles(change.styles)) { if(preview)report(element,'Use cores em hexadecimal ou RGB e valores numéricos válidos.'); return; }
    if(change.text!==undefined&&(typeof change.text!=='string'||change.text.length>8000||element.childElementCount>0)) { report(element,'Edite texto apenas em elementos sem outros elementos dentro.'); return; }
    const registry=preview?originals:managed;
    if(!registry.has(element)) registry.set(element,{style:element.getAttribute('style'),text:element.childElementCount===0?element.textContent:undefined});
    Object.assign(element.style,change.styles); if(change.text!==undefined) element.textContent=change.text;
    if(selected===element) paint(element.getBoundingClientRect());
    if(preview)report(element);
  }
  addEventListener('message',event=>{
    if(event.source!==parent||!event.data||typeof event.data!=='object') return;
    const message=event.data;
    if(message.type==='draftroom:mode'&&['interact','element'].includes(message.mode)) {mode=message.mode;dragging=undefined;clear();}
    if(message.type==='draftroom:inspect') { const element=find(message.selector); if(element) {selected=element;report(element);} }
    if(message.type==='draftroom:preview') apply(message,true);
    if(message.type==='draftroom:revert') {revert();if(selected) report(selected);}
    if(message.type==='draftroom:overrides'&&Array.isArray(message.edits)) {
      const key=JSON.stringify(message.edits);if(key===overridesKey)return;overridesKey=key;
      revert();managed.forEach((original,element)=>{if(original.style===null)element.removeAttribute('style');else element.setAttribute('style',original.style);if(original.text!==undefined)element.textContent=original.text;});managed=new Map();
      message.edits.slice(0,1000).forEach(change=>{if(change&&typeof change==='object')apply(change,false);});if(selected)report(selected);
    }
  });
  function region(event) { const x=Math.max(0,Math.min(dragging.x,event.clientX)), y=Math.max(0,Math.min(dragging.y,event.clientY)); return {x,y,width:Math.max(1,Math.min(innerWidth,Math.max(dragging.x,event.clientX))-x),height:Math.max(1,Math.min(innerHeight,Math.max(dragging.y,event.clientY))-y)}; }
  document.addEventListener('pointerdown',event=>{if(mode!=='element'||event.button!==0||!(event.target instanceof Element))return;event.preventDefault();event.stopImmediatePropagation();dragging={x:event.clientX,y:event.clientY,element:event.target,moved:false};},true);
  document.addEventListener('pointermove',event=>{
    if(mode!=='element'||!(event.target instanceof Element))return;
    if(dragging) {dragging.moved ||= Math.hypot(event.clientX-dragging.x,event.clientY-dragging.y)>6; if(dragging.moved) {paint(region(event));return;} }
    paint(event.target.getBoundingClientRect());
  },true);
  document.addEventListener('pointerup',event=>{
    if(mode!=='element'||!dragging)return;event.preventDefault();event.stopImmediatePropagation();
    if(dragging.moved) {parent.postMessage({type:'draftroom:selection',target:{kind:'region',label:'Área selecionada',rect:region(event)}},'*');dragging=undefined;return;}
    const element=dragging.element,rect=element.getBoundingClientRect();selected=element;
    parent.postMessage({type:'draftroom:selection',target:{kind:'element',selector:selector(element),label:(element.getAttribute('aria-label')||element.textContent||element.tagName).trim().replace(/\s+/g,' ').slice(0,180),rect:{x:Math.max(0,rect.x),y:Math.max(0,rect.y),width:Math.max(1,Math.min(innerWidth,rect.right)-Math.max(0,rect.x)),height:Math.max(1,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.y))}}},'*');
    report(element);dragging=undefined;
  },true);
  document.addEventListener('pointercancel',()=>{dragging=undefined;clear();},true);
  document.addEventListener('click',event=>{if(mode==='element'){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){mode='interact';dragging=undefined;clear();parent.postMessage({type:'draftroom:escape'},'*');}},true);
  parent.postMessage({type:'draftroom:ready'},'*');
})();
