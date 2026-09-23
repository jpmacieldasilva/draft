#!/usr/bin/env node
import path from 'node:path';
import { startRuntime } from './server.js';
import { exportWorkspace } from './export.js';
import { createWorkspace, discoverExperiment, WorkspaceStore } from './workspace.js';
const args = process.argv.slice(2);
const [command = 'open', folder = '.', output] = args;
const port = Number(process.env.DRAFT_PORT ?? process.env.PROTOFIELD_PORT ?? 4173);
function parsePresenceArgs(cliArgs: string[]) {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = cliArgs[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}
try {
  if (command === 'export') { if (!output) throw new Error('Uso: draft export <pasta> <destino>'); await exportWorkspace(path.resolve(folder), path.resolve(output)); console.log(`Bundle somente leitura: ${path.resolve(output)}`); }
  else if (command === 'create') { console.log(`Workspace criado: ${await createWorkspace(path.resolve(folder), output || 'Meu espaço')}`); }
  else if (command === 'inspect') { const discovery = await discoverExperiment(path.resolve(folder)); console.log(JSON.stringify({ generated: discovery.generated, experiment: discovery.experiment }, null, 2)); }
  else if (command === 'open') { const runtime = await startRuntime(path.resolve(folder), port); console.log(`Draft: ${runtime.url}`); const shutdown = () => { void runtime.close().then(() => process.exit(0)); }; process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); }
  else if (command === 'presence') {
    const sub = args[1];
    const { flags, positionals } = parsePresenceArgs(args.slice(2));
    const targetFolder = positionals[0];
    if (!targetFolder && sub !== 'list') throw new Error('Uso: draft presence claim <workspace> [frameId] [--label Agent] [--ttl 120] | clear <workspace> [frameId] | list <workspace>');
    const store = new WorkspaceStore(path.resolve(targetFolder || '.'));
    if (sub === 'claim') {
      const frameId = positionals[1] || undefined;
      const label = flags.label;
      const ttlSeconds = flags.ttl ? Number(flags.ttl) : undefined;
      const id = flags.id;
      const { actor } = await store.claim({ id, label, frameId, ttlSeconds });
      console.log(JSON.stringify(actor, null, 2));
    } else if (sub === 'clear') {
      const frameId = positionals[1];
      const id = flags.id;
      const filter = id ? { id } : (frameId !== undefined ? { frameId } : undefined);
      const state = await store.clearPresence(filter);
      console.log(JSON.stringify(state, null, 2));
    } else if (sub === 'list') {
      const presence = await store.loadPresence();
      console.log(JSON.stringify(presence, null, 2));
    } else {
      throw new Error('Uso: draft presence claim <workspace> [frameId] [--label Agent] [--ttl 120] | clear <workspace> [frameId] | list <workspace>');
    }
  }
  else throw new Error('Uso: draft open <pasta> | create <pasta> [título] | inspect <pasta> | export <pasta> <destino> | presence <claim|clear|list> <pasta>');
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }

