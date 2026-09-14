#!/usr/bin/env node
import path from 'node:path';
import { startRuntime } from './server.js';
import { exportWorkspace } from './export.js';
import { createWorkspace, discoverExperiment } from './workspace.js';
const [command = 'open', folder = '.', output] = process.argv.slice(2);
try {
  if (command === 'export') { if (!output) throw new Error('Uso: protofield export <pasta> <destino>'); await exportWorkspace(path.resolve(folder), path.resolve(output)); console.log(`Bundle somente leitura: ${path.resolve(output)}`); }
  else if (command === 'create') { console.log(`Workspace criado: ${await createWorkspace(path.resolve(folder), output || 'Meu espaço')}`); }
  else if (command === 'inspect') { const discovery = await discoverExperiment(path.resolve(folder)); console.log(JSON.stringify({ generated: discovery.generated, experiment: discovery.experiment }, null, 2)); }
  else if (command === 'open') { const runtime = await startRuntime(path.resolve(folder), Number(process.env.PROTOFIELD_PORT || 4173)); console.log(`Draftroom: ${runtime.url}`); const shutdown = () => { void runtime.close().then(() => process.exit(0)); }; process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); }
  else throw new Error('Uso: protofield open <pasta> | create <pasta> [título] | inspect <pasta> | export <pasta> <destino>');
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
