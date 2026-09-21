import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceStore, confined, createWorkspace, discoverExperiment } from '../src/runtime/workspace.js';
import { startRuntime } from '../src/runtime/server.js';
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'draftroom-test-')); await mkdir(path.join(root, 'frames/one'), { recursive: true }); await writeFile(path.join(root, 'frames/one/index.html'), '<html><head></head><body><button>Olá</button></body></html>'); await writeFile(path.join(root, 'experiment.json'), JSON.stringify({ id: 'test', title: 'Test', extra: 'preserved', frames: [{ id: 'one', title: 'One', context: 'keep-frame-metadata', entry: 'frames/one/index.html', viewport: { width: 800, height: 600 } }, { id: 'broken', title: 'Broken', entry: 'missing.html', viewport: { width: 800, height: 600 } }] })); return root; }
const target = { kind: 'region', label: 'Área', rect: { x: 2, y: 3, width: 50, height: 40 } };
describe('Persistência do workspace', () => {
  test('cria um workspace mínimo que abre imediatamente', async () => { const parent = await mkdtemp(path.join(os.tmpdir(), 'draftroom-create-')); const root = path.join(parent, 'novo-estudo'); try { await createWorkspace(root, 'Novo estudo'); const workspace = await new WorkspaceStore(root).snapshot(); assert.equal(workspace.experiment.title, 'Novo estudo'); assert.equal(workspace.experiment.frames[0].entry, 'frames/main/index.html'); } finally { await rm(parent, { recursive: true }); } });
  test('descobre uma pasta simples com index.html sem manifesto', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'draftroom-discover-')); try { await writeFile(path.join(root, 'index.html'), '<h1>Olá</h1>'); const discovery = await discoverExperiment(root); assert.equal(discovery.generated, true); assert.equal(discovery.experiment.frames[0].entry, 'index.html'); } finally { await rm(root, { recursive: true }); } });
  test('cria uma alternativa sem sobrescrever frames existentes', async () => { const root = await fixture(); try { const store = new WorkspaceStore(root); const created = await store.createFrame('Mais compacto'); assert.equal(created.experiment.frames.at(-1)?.id, 'mais-compacto'); assert.match(await readFile(path.join(root, 'frames/mais-compacto/index.html'), 'utf8'), /Mais compacto/); assert.equal(created.experiment.frames.length, 3); } finally { await rm(root, { recursive: true }); } });
  test('preserva eventos ao resolver e reabrir feedback', async () => { const root = await fixture(); try { const store = new WorkspaceStore(root); await store.initialize(); const created = await store.feedback({ frameId: 'one', message: 'Mais espaço', target }); const id = created.feedback[0].id; await store.feedback({ status: 'resolved' }, id); await store.feedback({ status: 'open' }, id); const reopened = await new WorkspaceStore(root).snapshot(); assert.equal(reopened.feedback[0].status, 'open'); assert.equal((await readFile(path.join(root, '.draft/feedback.jsonl'), 'utf8')).trim().split('\n').length, 3); } finally { await rm(root, { recursive: true }); } });
  test('rejeita revisão obsoleta sem perder a composição salva', async () => { const root = await fixture(); try { const store = new WorkspaceStore(root); const initial = await store.snapshot(); const layout = { frames: { one: { x: 20, y: 30, width: 800, height: 600 } }, x: 0, y: 0, zoom: 0.5 }; await store.saveLayout({ revision: initial.revision, layout }); await assert.rejects(store.saveLayout({ revision: initial.revision, layout: { ...layout, zoom: 1 } }), /composição mudou/); assert.equal((await store.snapshot()).layout?.zoom, 0.5); } finally { await rm(root, { recursive: true }); } });
  test('duplica arquivos e renomeia sem alterar a alternativa original', async () => { const root = await fixture(); try { const store = new WorkspaceStore(root); const duplicated = await store.changeFrame('one', 'duplicate', {}); const copy = duplicated.experiment.frames[2]; assert.equal(await readFile(path.join(root, copy.entry), 'utf8'), await readFile(path.join(root, 'frames/one/index.html'), 'utf8')); await store.changeFrame(copy.id, 'rename', { title: 'Alternative' }); const updated = await store.snapshot(); assert.equal(updated.experiment.frames[0].title, 'One'); assert.equal(updated.experiment.frames[2].title, 'Alternative'); assert.match(await readFile(path.join(root, 'experiment.json'), 'utf8'), /preserved/); assert.match(await readFile(path.join(root, 'experiment.json'), 'utf8'), /keep-frame-metadata/); } finally { await rm(root, { recursive: true }); } });
});
describe('Isolamento e validação', () => {
  test('mantém frames válidos quando outro arquivo está ausente', async () => { const root = await fixture(); try { const workspace = await new WorkspaceStore(root).snapshot(); assert.equal(workspace.experiment.frames[0].error, undefined); assert.ok(workspace.experiment.frames[1].error); } finally { await rm(root, { recursive: true }); } });
  test('bloqueia traversal e symlinks para fora da pasta', async () => { const root = await fixture(); try { await symlink('/etc/passwd', path.join(root, 'leak.html')); await assert.rejects(confined(root, 'leak.html'), /fora/); await assert.rejects(confined(root, '../../etc/passwd')); } finally { await rm(root, { recursive: true }); } });
  test('nega escrita cross-origin e arquivos privados, servindo HTML em outra origem', async () => { const root = await fixture(); const runtime = await startRuntime(root, 0); try { const initial = await runtime.store.snapshot(); assert.notEqual(runtime.url, runtime.contentUrl); const html = await fetch(`${runtime.contentUrl}/frames/one/index.html`); assert.equal(html.status, 200); assert.match(await html.text(), /bridge.js/); assert.match(html.headers.get('content-security-policy') || '', /connect-src 'none'/); assert.equal((await fetch(`${runtime.contentUrl}/experiment.json`)).status, 403); const response = await fetch(`${runtime.url}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Draft-Token': initial.token, Origin: 'http://evil.test' }, body: JSON.stringify({ frameId: 'one', message: 'No', target }) }); assert.equal(response.status, 403); const valid = await fetch(`${runtime.url}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Draft-Token': initial.token, Origin: runtime.url }, body: JSON.stringify({ frameId: 'one', message: 'Yes', target }) }); assert.equal(valid.status, 200); assert.equal((await runtime.store.snapshot()).feedback.length, 1); } finally { await runtime.close(); await rm(root, { recursive: true }); } });
});

test('nega symlinks públicos apontando para arquivos privados internos', async () => {
  const root = await fixture(); await writeFile(path.join(root, '.secret.json'), '{"secret":"sentinel"}'); await symlink(path.join(root, '.secret.json'), path.join(root, 'public.json')); const runtime = await startRuntime(root, 0);
  try { const response = await fetch(`${runtime.contentUrl}/public.json`); assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /sentinel/); }
  finally { await runtime.close(); await rm(root, { recursive: true }); }
});
test('nega gravação de feedback através de symlink interno', async () => {
  const root = await fixture(); await mkdir(path.join(root, '.draft')); await writeFile(path.join(root, 'untouched.txt'), 'keep'); await symlink(path.join(root, 'untouched.txt'), path.join(root, '.draft/feedback.jsonl')); const store = new WorkspaceStore(root);
  try { await assert.rejects(store.feedback({ frameId: 'one', message: 'No', target }), /symlink/); assert.equal(await readFile(path.join(root, 'untouched.txt'), 'utf8'), 'keep'); }
  finally { await rm(root, { recursive: true }); }
});

test('preserva metadados próprios de duplicatas antigas ao renomear o original', async () => {
 const root = await fixture(); const store = new WorkspaceStore(root);
 try { const copied = await store.changeFrame('one', 'duplicate', {}); const copyId = copied.experiment.frames[2].id; const manifest = JSON.parse(await readFile(path.join(root, 'experiment.json'), 'utf8')); manifest.frames[2].context = 'custom-copy-context'; await writeFile(path.join(root, 'experiment.json'), JSON.stringify(manifest)); await store.changeFrame('one', 'rename', { title: 'Renamed original' }); const updated = JSON.parse(await readFile(path.join(root, 'experiment.json'), 'utf8')); assert.equal(updated.frames.find((frame: { id: string }) => frame.id === copyId).context, 'custom-copy-context'); }
 finally { await rm(root, { recursive: true }); }
});

describe('Ajustes visuais e fluxos',()=>{
 test('grava ajustes no HTML do protótipo e restaura o original',async()=>{
  const root=await fixture();try{
   const store=new WorkspaceStore(root);const before=await readFile(path.join(root,'frames/one/index.html'),'utf8');
   await store.saveEdit({frameId:'one',selector:'button',styles:{color:'#123456'},text:'Novo texto'});
   const afterFirst=await readFile(path.join(root,'frames/one/index.html'),'utf8');
   assert.notEqual(afterFirst,before);assert.match(afterFirst,/Novo texto/);assert.match(afterFirst,/123456|#123456/i);
   await store.saveEdit({frameId:'one',selector:'button',styles:{padding:'12px'}});
   assert.match(await readFile(path.join(root,'frames/one/index.html'),'utf8'),/padding:\s*12px/i);
   await store.saveEdit({frameId:'one',selector:'button',remove:true});
   assert.equal(await readFile(path.join(root,'frames/one/index.html'),'utf8'),before);
  }finally{await rm(root,{recursive:true});}
 });
 test('migra edits.json legado para o HTML do protótipo',async()=>{
  const root=await fixture();try{
   await mkdir(path.join(root,'.draftroom'),{recursive:true});
   await writeFile(path.join(root,'.draftroom/edits.json'),JSON.stringify([{id:'legacy',frameId:'one',selector:'button',styles:{fontSize:'30px'}}]));
   await new WorkspaceStore(root).snapshot();
   assert.match(await readFile(path.join(root,'frames/one/index.html'),'utf8'),/font-size:\s*30px/i);
   await assert.rejects(access(path.join(root,'.draftroom/edits.json')));
  }finally{await rm(root,{recursive:true});}
 });
 test('persiste ajustes no protótipo via API',async()=>{
  const root=await fixture();const runtime=await startRuntime(root,0);
  try{
   const initial=await runtime.store.snapshot();
   await fetch(`${runtime.url}/api/edits`,{method:'POST',headers:{'Content-Type':'application/json','X-Draft-Token':initial.token,Origin:runtime.url},body:JSON.stringify({frameId:'one',selector:'button',styles:{fontSize:'30px'}})});
   assert.match(await readFile(path.join(root,'frames/one/index.html'),'utf8'),/font-size:\s*30px/i);
  }finally{await runtime.close();await rm(root,{recursive:true});}
 });
 test('rejeita propriedades fora da lista e URLs em ajustes',async()=>{
  const root=await fixture();try{const store=new WorkspaceStore(root);
   await assert.rejects(store.saveEdit({frameId:'one',selector:'button',styles:{backgroundImage:'url(https://example.com)'}}));
   await assert.rejects(store.saveEdit({frameId:'one',selector:'button',styles:{color:'red; background: blue'}}));
   await assert.rejects(store.saveEdit({frameId:'missing',selector:'button',styles:{color:'#fff'}}));
  }finally{await rm(root,{recursive:true});}
 });
 test('persiste conexões e rejeita pontas inexistentes',async()=>{
  const root=await fixture();try{const store=new WorkspaceStore(root);const initial=await store.snapshot();
   const position={x:0,y:0,width:800,height:600};const connection={id:'link-1',from:'one',to:'broken',label:'Continuar'};
   const layout={frames:{one:position,broken:{...position,x:900}},x:0,y:0,zoom:1,connections:[connection]};
   const saved=await store.saveLayout({revision:initial.revision,layout});assert.deepEqual(saved.layout?.connections,[connection]);
   await assert.rejects(store.saveLayout({revision:saved.revision,layout:{...layout,connections:[{...connection,to:'missing'}]}}));
  }finally{await rm(root,{recursive:true});}
 });
});
