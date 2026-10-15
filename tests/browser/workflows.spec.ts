import { test, expect } from './harness';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const stateDir = (folder: string) => path.join(folder, '.draft');
let folder = '';
let url = '';
test.beforeEach(async ({studio}) => { folder = studio.folder; url = studio.url; });

test('preserva interação entre canvas, apresentação e retorno',async({page})=>{
 await page.goto(url);
 await expect(page.getByRole('button',{name:'Conexões',exact:true})).toHaveCount(0);
 await expect(page.getByText('3 protótipos',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/Arraste o fundo para explorar/)).toHaveCount(0);
 const toolbarBounds=await page.locator('.toolbar').boundingBox();
 const minimapBounds=await page.locator('.minimap').boundingBox();
 if(!toolbarBounds||!minimapBounds)throw new Error('Barra ou minimapa não visível');
 expect(Math.abs(toolbarBounds.y+toolbarBounds.height-(minimapBounds.y+minimapBounds.height))).toBeLessThan(2);
 const frame=page.frameLocator('iframe[title="Base clara"]');
 const row=frame.locator('.row',{hasText:'Responder o e-mail do contador'});
 await row.click();
 await expect(row).toHaveClass(/done/);
 await page.getByRole('button',{name:'Apresentar Base clara',exact:true}).click();
 await expect(page).toHaveURL(/#frame\/base$/);
 await expect(row).toHaveClass(/done/);
 await page.getByRole('button',{name:'Tela cheia',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
 await page.getByRole('button',{name:/Canvas/}).click();
 await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
 await expect(row).toHaveClass(/done/);
 await page.getByRole('button',{name:'Lista que entende o que você escreve',exact:false}).click();
 await expect(page.getByRole('dialog')).toContainText('Um app de lista minimalista');
 await page.getByRole('button',{name:'Fechar informações'}).click();
});

test('abre inspector ao selecionar elemento sem misturar comentários',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Inspecionar',exact:false}).click();
 await page.frameLocator('iframe[title="Base clara"]').getByRole('heading',{name:/^Datas/}).click();
 await expect(page.getByRole('complementary',{name:'Inspector'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Salvar ajuste',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'O que precisa mudar?'})).toHaveCount(0);
});

test('persiste comentário de região, resolve e reabre na pasta',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Base clara',exact:true}).click();
 await page.getByRole('button',{name:'Centralizar frames',exact:true}).click();
 await page.getByRole('button',{name:'Comentar',exact:false}).click();
 await expect(page.getByText(/Arraste no protótipo para marcar uma região/)).toBeVisible();
 const iframe=page.locator('iframe[title="Base clara"]');
 await expect.poll(async()=>{
  const region=await iframe.boundingBox();
  if(!region)return false;
  await page.mouse.move(region.x+40,region.y+70);
  await page.mouse.down();
  await page.mouse.move(region.x+region.width-50,region.y+region.height-60,{steps:15});
  await page.mouse.up();
  return page.getByText('Região selecionada').isVisible();
 },{timeout:15_000}).toBe(true);
 await page.getByRole('textbox',{name:'O que precisa mudar?'}).fill('Dar mais espaço ao título.');
 await page.getByRole('button',{name:'Salvar comentário'}).click();
 await expect(page.getByRole('button',{name:'Resolver',exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:/^Comentários/}).click();
 await expect(page.getByText('Dar mais espaço ao título.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Resolver',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reabrir',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resolver',exact:true})).toBeVisible();
 const log=await readFile(path.join(stateDir(folder),'feedback.jsonl'),'utf8');
 expect(log.trim().split('\n')).toHaveLength(3);
 expect(log).toContain('"kind":"region"');
});

test('recarrega apenas o frame alterado e preserva outro formulário',async({page})=>{
 await page.goto(url);
 const search=page.frameLocator('iframe[title="Launcher escuro"]').getByRole('textbox');
 await search.fill('intervalo');
 const filename=path.join(folder,'frames/base/index.html');
 await writeFile(filename,(await readFile(filename,'utf8')).replace('Dentista — Dra. Helena','Dentista — Dra. Marina'));
 await expect(page.frameLocator('iframe[title="Base clara"]').getByText('Dentista — Dra. Marina')).toBeVisible();
 await expect(search).toHaveValue('intervalo');
});

test('duplica e oculta uma alternativa sem apagar a fonte',async({page})=>{
 await page.goto(url);
 await page.getByLabel('Opções de Base clara').click();
 await page.getByRole('button',{name:'Duplicar alternativa',exact:true}).first().click();
 await expect(page.locator('iframe')).toHaveCount(5);
 const manifest: {frames:Array<{id:string;title:string}>}=JSON.parse(await readFile(path.join(folder,'experiment.json'),'utf8'));
 expect(manifest.frames).toHaveLength(5);
 expect(await readFile(path.join(folder,'frames/base/index.html'),'utf8')).toContain('Dentista — Dra. Helena');
 await page.getByRole('button',{name:'Ocultar do canvas',exact:true}).first().click();
 await expect(page.locator('iframe[title="Base clara"]')).toBeHidden();
 await page.getByText('1 oculto',{exact:true}).click();
 await page.getByRole('button',{name:'Restaurar Base clara',exact:true}).click();
 await expect(page.locator('iframe[title="Base clara"]')).toBeVisible();
});

test('cria uma alternativa pelo viewer sem editar o manifesto',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Adicionar protótipo',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Adicionar protótipo'})).toBeVisible();
 await page.getByRole('textbox',{name:'Nome da alternativa'}).fill('Mais simples');
 await page.getByRole('button',{name:'Criar protótipo',exact:true}).click();
 await expect(page.locator('iframe[title="Mais simples"]')).toBeVisible();
 const manifest: {frames:Array<{id:string;entry:string}>}=JSON.parse(await readFile(path.join(folder,'experiment.json'),'utf8'));
 expect(manifest.frames.at(-1)?.id).toBe('mais-simples');
 expect(manifest.frames.at(-1)?.entry).toBe('frames/mais-simples/index.html');
 expect(await readFile(path.join(folder,'frames/mais-simples/README.md'),'utf8')).toContain('Mais simples');
});

test('persiste movimento e tamanho do frame',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Base clara',exact:true}).click();
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(stateDir(folder),'layout.json'),'utf8').catch(()=>'{"frames":{"base":{"x":0,"width":960}}}')).frames.base.x).toBe(10);
 const handle=page.getByRole('separator',{name:'Redimensionar Base clara'});
 const bounds=await handle.boundingBox();
 if(!bounds)throw new Error('Alça não visível');
 const originX=bounds.x+bounds.width/2, originY=bounds.y+bounds.height/2;
 await page.mouse.move(originX,originY);await page.mouse.down();await page.mouse.move(originX+120,originY+80);await page.mouse.up();
 await expect.poll(async()=>JSON.parse(await readFile(path.join(stateDir(folder),'layout.json'),'utf8').catch(()=>'{"frames":{"base":{"x":0,"width":960}}}')).frames.base.width).toBeGreaterThan(960);
});

test('marca região e persiste comentário',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Base clara',exact:true}).click();
 await page.getByRole('button',{name:'Centralizar frames',exact:true}).click();
 await page.getByRole('button',{name:'Comentar',exact:false}).click();
 await expect(page.getByText(/Arraste no protótipo para marcar uma região/)).toBeVisible();
 const iframe=page.locator('iframe[title="Base clara"]');
 await expect.poll(async()=>{
  const region=await iframe.boundingBox();
  if(!region)return false;
  await page.mouse.move(region.x+40,region.y+70);
  await page.mouse.down();
  await page.mouse.move(region.x+region.width-50,region.y+region.height-60,{steps:15});
  await page.mouse.up();
  return page.getByText('Região selecionada').isVisible();
 },{timeout:15_000}).toBe(true);
 await expect(page.getByRole('textbox',{name:'O que precisa mudar?'})).toBeVisible();
 await page.getByRole('textbox',{name:'O que precisa mudar?'}).fill('Rever o espaço desta região.');
 await page.getByRole('button',{name:'Salvar comentário'}).click();
 await expect(page.getByRole('button',{name:'Resolver',exact:true})).toBeVisible();
 expect(await readFile(path.join(stateDir(folder),'feedback.jsonl'),'utf8')).toContain('"kind":"region"');
});

test('bundle estático abre em subpasta sem API e preserva interação',async({page})=>{
 test.setTimeout(60_000);
 const lateralHtml=path.join(folder,'frames/lateral/index.html');
 await writeFile(lateralHtml,(await readFile(lateralHtml,'utf8')).replace('<h1>','<h1 style="font-size:42px">'));
 const output=await mkdtemp(path.join(tmpdir(),'draft-export-'));
 const bundle=path.join(output,'bundle');
 const exporter=spawn(process.execPath,['dist/runtime/cli.js','export',folder,bundle]);
 await new Promise<void>((resolve,reject)=>exporter.once('exit',code=>code===0?resolve():reject(new Error('Export falhou'))));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
 const staticServer=createServer(async(request,response)=>{
  try {
   const pathname=new URL(request.url??'/','http://local').pathname;
   let entry=path.join(output,decodeURIComponent(pathname));
   if(entry.endsWith(path.sep)||!path.extname(entry)) entry=path.join(entry,'index.html');
   response.setHeader('Content-Type',types[path.extname(entry)]??'application/octet-stream');
   response.end(await readFile(entry));
  }
  catch {response.writeHead(404);response.end();}
 });
 await new Promise<void>(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
 const address=staticServer.address();if(!address||typeof address==='string')throw new Error('Porta inválida');
 try {
  await page.goto(`http://127.0.0.1:${address.port}/bundle/index.html`);
  await page.getByRole('button',{name:'Apresentar Compacta com barra lateral',exact:true}).click();
  await expect(page.getByRole('button',{name:/Canvas/})).toBeVisible();
  await expect(page.frameLocator('iframe[title="Compacta com barra lateral"]').getByRole('heading',{level:1})).toHaveCSS('font-size','42px');
  const row=page.frameLocator('iframe[title="Compacta com barra lateral"]').locator('tr.r',{hasText:'Leite integral'});
  await row.click();
  await expect(row).toHaveClass(/done/);
  await page.getByRole('button',{name:/Canvas/}).click();
  await expect(page.getByText('Somente leitura',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Inspecionar/})).toHaveCount(0);
 } finally {await new Promise<void>(resolve=>{staticServer.close(()=>resolve());staticServer.closeAllConnections();});await rm(output,{recursive:true,force:true});}
});

test('sincroniza composição entre abas antes de uma nova alteração',async({page,context})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Base clara',exact:true}).click();
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(stateDir(folder),'layout.json'),'utf8').catch(()=>'{"frames":{"base":{"x":0,"width":960}}}')).frames.base.x).toBe(10);
 const second=await context.newPage();await second.goto(url);
 await expect(second.locator('article[aria-label="Base clara"]')).toHaveCSS('left','10px');
 await page.keyboard.press('ArrowRight');
 await expect(second.locator('article[aria-label="Base clara"]')).toHaveCSS('left','20px');
 await second.getByRole('button',{name:'Base clara',exact:true}).click();
 await second.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(stateDir(folder),'layout.json'),'utf8').catch(()=>'{"frames":{"base":{"x":0,"width":960}}}')).frames.base.x).toBe(30);
});

test('edita visualmente, preserva ajustes sucessivos e restaura o original',async({page,studio})=>{
 const htmlPath=path.join(studio.folder,'frames/base/index.html');
 const original=await readFile(htmlPath,'utf8');
 await page.goto(studio.url);
 const title=page.frameLocator('iframe[title="Base clara"]').getByRole('heading',{name:/^Datas/});
 const openInspect=async()=>{
  await page.getByRole('button',{name:'Inspecionar',exact:false}).click();
  await title.click();
  await expect(page.getByText('Selecionado',{exact:true})).toBeVisible();
 };
 await openInspect();
 await expect(page.getByText('Layout',{exact:true})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'Tamanho do texto (px)',exact:true}).fill('30');
 await expect(page.getByText('Não salvo',{exact:true})).toBeVisible();
 await expect(title).toHaveCSS('font-size','30px');
 await page.getByRole('button',{name:'Salvar ajuste',exact:true}).click();
 await expect(page.getByText('Ajuste salvo.',{exact:true})).toBeVisible();
 await expect.poll(async()=>/font-size:\s*30px/i.test(await readFile(htmlPath,'utf8'))).toBe(true);
 await page.getByRole('spinbutton',{name:'Espaço interno (px)',exact:true}).fill('12');
 await expect(page.getByText('Não salvo',{exact:true})).toBeVisible();
 await expect(title).toHaveCSS('padding-top','12px');
 await page.getByRole('button',{name:'Salvar ajuste',exact:true}).click();
 await expect.poll(async()=>{const html=await readFile(htmlPath,'utf8');return /padding:\s*12px/i.test(html)&&/font-size:\s*30px/i.test(html);}).toBe(true);
 await page.reload();
 await expect(title).toHaveCSS('font-size','30px');
 await expect(title).toHaveCSS('padding-top','12px');
 await openInspect();
 await page.getByRole('button',{name:'Restaurar original',exact:true}).click();
 await expect.poll(async()=>await readFile(htmlPath,'utf8')).toBe(original);
 await expect.poll(async()=>title.evaluate(element=>getComputedStyle(element).fontSize)).toBe('13px');
 await expect.poll(async()=>title.evaluate(element=>getComputedStyle(element).paddingTop)).toBe('0px');
});

test('cria conexão rotulada e navega no minimapa',async({page})=>{
 await page.goto(url);
 await expect(page.getByRole('button',{name:'Sobre o espaço',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Região',exact:true})).toHaveCount(0);
 await expect(page.getByText('Pasta local',{exact:true})).toHaveCount(0);
 await page.locator('[data-frame-connector="base"]').click();
 await page.locator('[data-frame-connector="launcher"]').click();
 await page.getByRole('textbox',{name:'Rótulo',exact:true}).fill('Escolher um texto');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.locator('.flow-label')).toHaveText('Escolher um texto');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'experiment.json'),'utf8')).edges?.[0]).toEqual({from:'base',to:'launcher',label:'Escolher um texto'});
 expect(JSON.parse(await readFile(path.join(stateDir(folder),'layout.json'),'utf8').catch(()=>'{}')).connections).toBeUndefined();
 await page.reload();await expect(page.locator('.flow-label')).toHaveText('Escolher um texto');
 const world=page.locator('.world');const previous=await world.getAttribute('style');
 await page.locator('.minimap svg').click({position:{x:20,y:20}});
 await expect(world).not.toHaveAttribute('style',previous??'');
 await page.getByRole('button',{name:'Centralizar frames',exact:true}).click();
});

test('altera viewport por preset sem recarregar o protótipo',async({page})=>{
 await page.goto(url);
 const frame=page.frameLocator('iframe[title="Base clara"]');
 const row=frame.locator('.row',{hasText:'Responder o e-mail do contador'});
 await row.click();
 await page.getByLabel('Viewport de Base clara', {exact:true}).click();
 await page.getByRole('button',{name:'Tablet',exact:true}).click();
 await expect(page.locator('iframe[title="Base clara"]')).toHaveCSS('width','768px');
 await expect(row).toHaveClass(/done/);
});

test('puxa uma curva entre protótipos e remove a conexão',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Centralizar frames',exact:true}).click();
 const start=await page.locator('[data-frame-connector="base"]').boundingBox();
 const end=await page.locator('[data-frame-connector="launcher"]').boundingBox();
 if(!start||!end)throw new Error('Frames não visíveis');
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:12});await page.mouse.up();
 await expect(page.getByRole('button',{name:'Salvar conexão',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Rótulo',exact:true}).fill('Abrir biblioteca');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.locator('.flow-label')).toHaveText('Abrir biblioteca');
 await page.getByRole('button',{name:'Conexão: Abrir biblioteca',exact:true}).click();
 await page.getByRole('button',{name:'Remover',exact:true}).click();
 await expect(page.locator('.flow-line')).toHaveCount(0);
});
