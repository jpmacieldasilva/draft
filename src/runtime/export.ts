import { mkdir, cp, readFile, writeFile, readdir, realpath, access } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceStore, confined, publicPath, RequestError } from './workspace.js';
import { viewerDirectory, injectBridge } from './server.js';
export async function exportWorkspace(folder: string, output: string) {
  const store = new WorkspaceStore(folder); await store.initialize();
  const destination = path.resolve(output); if (destination === store.root || destination.startsWith(`${store.root}${path.sep}`)) throw new RequestError('Exporte para uma pasta fora do workspace.');
  try { await access(destination); throw new RequestError('A pasta de destino já existe. Escolha uma nova pasta.'); } catch (error) { if (error instanceof RequestError) throw error; }
  await mkdir(destination, { recursive: true }); await cp(viewerDirectory, destination, { recursive: true });
  const workspace = await store.snapshot(); workspace.readOnly = true; workspace.token = ''; workspace.feedback = [];
  const content = path.join(destination, 'content'); await mkdir(content);
  async function copyDirectory(relative: string) {
    for (const entry of await readdir(await confined(store.root, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'reviews'].includes(entry.name)) continue;
      const sourceRelative = path.join(relative, entry.name); if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { await copyDirectory(sourceRelative); continue; }
      if (!publicPath(sourceRelative)) continue;
      const source = await confined(store.root, sourceRelative); const target = path.join(content, sourceRelative); await mkdir(path.dirname(target), { recursive: true });
      if (path.extname(source) === '.html') { const bridge = path.relative(path.dirname(target), path.join(destination, 'bridge.js')).split(path.sep).join('/'); await writeFile(target, injectBridge(await readFile(source, 'utf8'), bridge)); } else await cp(source, target);
    }
  }
  await copyDirectory('.');
  for (const frame of workspace.experiment.frames) frame.url = `./content/${frame.entry}`;
  const serialized = JSON.stringify(workspace).replaceAll('<', '\\u003c');
  const html = await readFile(path.join(destination, 'index.html'), 'utf8'); await writeFile(path.join(destination, 'index.html'), html.replace('<head>', `<head><script>window.__DRAFTROOM__=${serialized}</script>`));
  await writeFile(path.join(destination, 'workspace.json'), JSON.stringify(workspace, null, 2));
  return realpath(destination);
}
