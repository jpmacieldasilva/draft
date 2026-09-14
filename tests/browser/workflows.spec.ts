import { test, expect } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';

let folder = '';
let url = '';
let server: ChildProcess;
test.beforeEach(async () => {
 folder = await mkdtemp(path.join(tmpdir(), 'draftroom-browser-'));
 await cp('examples/studio', folder, {recursive:true,filter:source=>!source.split(path.sep).includes('.draftroom')});
 server = spawn(process.execPath, ['dist/runtime/cli.js','open',folder], {env:{...process.env,PROTOFIELD_PORT:'0'},stdio:['ignore','pipe','pipe']});
 url = await new Promise<string>((resolve,reject) => {
  server.stdout?.on('data', (chunk:Buffer) => {const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});
  server.once('exit', code => reject(new Error(`Runtime encerrou: ${code}`)));
  server.once('error', reject);
 });
});
test.afterEach(async()=>{server?.kill('SIGTERM');await rm(folder,{recursive:true,force:true});});

test('preserva interação entre canvas, apresentação e retorno',async({page})=>{
 await page.goto(url);
 await expect(page.getByRole('button',{name:'Conexões',exact:true})).toHaveCount(0);
 await expect(page.getByText('3 protótipos',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/Arraste o fundo para explorar/)).toHaveCount(0);
 const toolbarBounds=await page.locator('.toolbar').boundingBox();
 const minimapBounds=await page.locator('.minimap').boundingBox();
 if(!toolbarBounds||!minimapBounds)throw new Error('Barra ou minimapa não visível');
 expect(Math.abs(toolbarBounds.y+toolbarBounds.height-(minimapBounds.y+minimapBounds.height))).toBeLessThan(2);
 const frame=page.frameLocator('iframe[title="Biblioteca editorial"]');
 await frame.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(frame.getByRole('button',{name:'Guardado ✓'})).toBeVisible();
 await page.getByRole('button',{name:'Apresentar Biblioteca editorial',exact:true}).click();
 await expect(page).toHaveURL(/#frame\/editorial$/);
 await expect(frame.getByRole('button',{name:'Guardado ✓'})).toBeVisible();
 await page.getByRole('button',{name:'Tela cheia',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
 await page.getByRole('button',{name:/Canvas/}).click();
 await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
 await expect(frame.getByRole('button',{name:'Guardado ✓'})).toBeVisible();
 await page.getByRole('button',{name:'Um espaço para ler',exact:false}).click();
 await expect(page.getByRole('dialog')).toContainText('Três caminhos');
 await page.getByRole('button',{name:'Fechar informações'}).click();
 await page.screenshot({path:'docs/canvas.png',fullPage:true});
});

test('persiste comentário de elemento, resolve e reabre na pasta',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Inspecionar',exact:false}).click();
 await page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading',{name:'A arte de prestar atenção'}).click();
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
 const log=await readFile(path.join(folder,'.draftroom/feedback.jsonl'),'utf8');
 expect(log.trim().split('\n')).toHaveLength(3);
 expect(log).toContain('featured-title');
 await page.screenshot({path:'docs/feedback.png',fullPage:true});
});

test('recarrega apenas o frame alterado e preserva outro formulário',async({page})=>{
 await page.goto(url);
 const search=page.frameLocator('iframe[title="Leitura em movimento"]').getByRole('textbox');
 await search.fill('intervalo');
 const filename=path.join(folder,'frames/editorial/index.html');
 await writeFile(filename,(await readFile(filename,'utf8')).replace('O que vale','O que merece'));
 await expect(page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading',{name:/O que merece/})).toBeVisible();
 await expect(search).toHaveValue('intervalo');
});

test('duplica e oculta uma alternativa sem apagar a fonte',async({page})=>{
 await page.goto(url);
 await page.getByLabel('Opções de Biblioteca editorial').click();
 await page.getByRole('button',{name:'Duplicar alternativa',exact:true}).first().click();
 await expect(page.locator('iframe')).toHaveCount(4);
 const manifest: {frames:Array<{id:string;title:string}>}=JSON.parse(await readFile(path.join(folder,'experiment.json'),'utf8'));
 expect(manifest.frames).toHaveLength(4);
 expect(await readFile(path.join(folder,'frames/editorial/index.html'),'utf8')).toContain('O que vale');
 await page.getByRole('button',{name:'Ocultar do canvas',exact:true}).first().click();
 await expect(page.locator('iframe[title="Biblioteca editorial"]')).toBeHidden();
 await page.getByText('1 oculto',{exact:true}).click();
 await page.getByRole('button',{name:'Restaurar Biblioteca editorial',exact:true}).click();
 await expect(page.locator('iframe[title="Biblioteca editorial"]')).toBeVisible();
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

test('marca região e persiste movimento e tamanho do frame',async({page})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Biblioteca editorial',exact:true}).click();
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/layout.json'),'utf8').catch(()=>'{"frames":{"editorial":{"x":0,"width":390}}}')).frames.editorial.x).toBe(10);
 const handle=page.getByRole('separator',{name:'Redimensionar Biblioteca editorial'});
 const bounds=await handle.boundingBox();
 if(!bounds)throw new Error('Alça não visível');
 await page.mouse.move(bounds.x+10,bounds.y+10);await page.mouse.down();await page.mouse.move(bounds.x+60,bounds.y+50);await page.mouse.up();
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/layout.json'),'utf8').catch(()=>'{"frames":{"editorial":{"x":0,"width":390}}}')).frames.editorial.width).toBeGreaterThan(390);
 await page.getByRole('button',{name:'Inspecionar',exact:false}).click();
 const region=await page.locator('iframe[title="Biblioteca editorial"]').boundingBox();
 if(!region)throw new Error('Região não visível');
 await page.mouse.move(region.x+20,region.y+20);await page.mouse.down();await page.mouse.move(region.x+120,region.y+100);await page.mouse.up();
 await page.getByRole('textbox',{name:'O que precisa mudar?'}).fill('Rever o espaço desta região.');
 await page.getByRole('button',{name:'Salvar comentário'}).click();
 await expect(page.getByRole('button',{name:'Resolver',exact:true})).toBeVisible();
 expect(await readFile(path.join(folder,'.draftroom/feedback.jsonl'),'utf8')).toContain('"kind":"region"');
});

test('bundle estático abre em subpasta sem API e preserva interação',async({page})=>{
 await mkdir(path.join(folder,'.draftroom'),{recursive:true});
 await writeFile(path.join(folder,'.draftroom/edits.json'),JSON.stringify([{id:'export-edit',frameId:'focus',selector:'h1',styles:{fontSize:'42px'}}]));
 const output=await mkdtemp(path.join(tmpdir(),'draftroom-export-'));
 const bundle=path.join(output,'bundle');
 const exporter=spawn(process.execPath,['dist/runtime/cli.js','export',folder,bundle]);
 await new Promise<void>((resolve,reject)=>exporter.once('exit',code=>code===0?resolve():reject(new Error('Export falhou'))));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
 const staticServer=createServer(async(request,response)=>{
  try {const filename=path.join(output,new URL(request.url??'/', 'http://local').pathname);const entry=filename.endsWith(path.sep)?path.join(filename,'index.html'):filename;response.setHeader('Content-Type',types[path.extname(entry)]??'application/octet-stream');response.end(await readFile(entry));}
  catch {response.writeHead(404);response.end();}
 });
 await new Promise<void>(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
 const address=staticServer.address();if(!address||typeof address==='string')throw new Error('Porta inválida');
 try {
  await page.goto(`http://127.0.0.1:${address.port}/bundle/#frame/focus`);
  await expect(page.getByRole('button',{name:/Canvas/})).toBeVisible();
  await expect(page.frameLocator('iframe[title="Um texto por vez"]').getByRole('heading',{level:1})).toHaveCSS('font-size','42px');
  await page.frameLocator('iframe[title="Um texto por vez"]').getByRole('button',{name:'Marcar como lido'}).click();
  await expect(page.frameLocator('iframe[title="Um texto por vez"]').getByRole('button',{name:'Leitura concluída ✓'})).toBeVisible();
  await page.getByRole('button',{name:/Canvas/}).click();
  await expect(page.getByText('Somente leitura',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Inspecionar/})).toHaveCount(0);
 } finally {await new Promise<void>(resolve=>staticServer.close(()=>resolve()));await rm(output,{recursive:true,force:true});}
});

test('sincroniza composição entre abas antes de uma nova alteração',async({page,context})=>{
 await page.goto(url);
 await page.getByRole('button',{name:'Biblioteca editorial',exact:true}).click();
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/layout.json'),'utf8').catch(()=>'{"frames":{"editorial":{"x":0,"width":390}}}')).frames.editorial.x).toBe(10);
 const second=await context.newPage();await second.goto(url);
 await expect(second.locator('article[aria-label="Biblioteca editorial"]')).toHaveCSS('left','10px');
 await page.keyboard.press('ArrowRight');
 await expect(second.locator('article[aria-label="Biblioteca editorial"]')).toHaveCSS('left','20px');
 await second.getByRole('button',{name:'Biblioteca editorial',exact:true}).click();
 await second.keyboard.press('ArrowRight');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/layout.json'),'utf8').catch(()=>'{"frames":{"editorial":{"x":0,"width":390}}}')).frames.editorial.x).toBe(30);
});

test('edita visualmente, preserva ajustes sucessivos e restaura o original',async({page})=>{
 await page.goto(url);
 const title=page.frameLocator('iframe[title="Biblioteca editorial"]').getByRole('heading',{name:'A arte de prestar atenção',exact:true});
 await page.getByRole('button',{name:'Inspecionar',exact:false}).click();await title.click();
 await expect(page.getByText('Selecionado',{exact:true})).toBeVisible();
 await expect(page.getByText('Layout',{exact:true})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'Tamanho do texto (px)',exact:true}).fill('30');
 await expect(title).toHaveCSS('font-size','30px');
 await page.screenshot({path:'docs/inspector-v2.png',fullPage:true});
 await page.getByRole('button',{name:'Salvar ajuste',exact:true}).click();
 await expect(page.getByText('Ajuste salvo.',{exact:true})).toBeVisible();
 await page.getByText('Espaçamento',{exact:true}).click();
 await page.getByRole('spinbutton',{name:'Espaço interno (px)',exact:true}).fill('12');
 await page.getByRole('button',{name:'Salvar ajuste',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/edits.json'),'utf8'))[0].styles.padding).toBe('12px');
 await page.reload();await expect(title).toHaveCSS('font-size','30px');await expect(title).toHaveCSS('padding-top','12px');
 await page.getByRole('button',{name:'Inspecionar',exact:false}).click();await title.click();
 await page.getByRole('button',{name:'Restaurar original',exact:true}).click();
 await expect(title).toHaveCSS('font-size','23px');await expect(title).toHaveCSS('padding-top','0px');
 expect(await readFile(path.join(folder,'frames/editorial/index.html'),'utf8')).not.toContain('font-size: 30px');
});

test('cria conexão rotulada e navega no minimapa',async({page})=>{
 await page.goto(url);
 await expect(page.getByRole('button',{name:'Sobre o espaço',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Região',exact:true})).toHaveCount(0);
 await expect(page.getByText('Pasta local',{exact:true})).toHaveCount(0);
 await page.locator('[data-frame-connector="editorial"]').click();
 await page.locator('[data-frame-connector="compact"]').click();
 await page.getByRole('textbox',{name:'Rótulo',exact:true}).fill('Escolher um texto');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.locator('.flow-label')).toHaveText('Escolher um texto');
 await expect.poll(async()=>JSON.parse(await readFile(path.join(folder,'.draftroom/layout.json'),'utf8').catch(()=>'{}')).connections?.[0]?.label).toBe('Escolher um texto');
 await page.reload();await expect(page.locator('.flow-label')).toHaveText('Escolher um texto');
 const world=page.locator('.world');const previous=await world.getAttribute('style');
 await page.locator('.minimap svg').click({position:{x:20,y:20}});
 await expect(world).not.toHaveAttribute('style',previous??'');
 await page.getByRole('button',{name:'Centralizar frames',exact:true}).click();
 await page.screenshot({path:'docs/canvas-v2.png',fullPage:true});
});

test('altera viewport por preset sem recarregar o protótipo',async({page})=>{
 await page.goto(url);
 const frame=page.frameLocator('iframe[title="Biblioteca editorial"]');
 await frame.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByLabel('Viewport de Biblioteca editorial', {exact:true}).click();
 await page.getByRole('button',{name:'Tablet',exact:true}).click();
 await expect(page.locator('iframe[title="Biblioteca editorial"]')).toHaveCSS('width','768px');
 await expect(frame.getByRole('button',{name:'Guardado ✓'})).toBeVisible();
});

test('puxa uma curva entre protótipos e remove a conexão',async({page})=>{
 await page.goto(url);
 const start=await page.locator('[data-frame-connector="editorial"]').boundingBox();
 const end=await page.locator('iframe[title="Leitura em movimento"]').boundingBox();
 if(!start||!end)throw new Error('Frames não visíveis');
 await page.mouse.move(start.x+14,start.y+14);await page.mouse.down();await page.mouse.move(end.x+30,end.y+100,{steps:12});await page.mouse.up();
 await expect(page.getByRole('button',{name:'Salvar conexão',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Rótulo',exact:true}).fill('Abrir biblioteca');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.locator('.flow-label')).toHaveText('Abrir biblioteca');
 await page.getByRole('button',{name:'Conexão: Abrir biblioteca',exact:true}).click();
 await page.getByRole('button',{name:'Remover',exact:true}).click();
 await expect(page.locator('.flow-line')).toHaveCount(0);
});
