#!/usr/bin/env node
import path from 'node:path';
import { startRuntime } from './server.js';
import { exportWorkspace } from './export.js';
import { createWorkspace, discoverExperiment, resolveLocale, WorkspaceStore } from './workspace.js';
import { translator } from '../i18n.js';
import { serveMcp } from './mcp.js';
import { buildContext, feedbackItems } from './agent.js';

const t = translator(resolveLocale());
const USAGE = t('cli.usage');

function parseArgs(cliArgs: string[]) {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i];
    if (!arg.startsWith('--')) { positionals.push(arg); continue; }
    const key = arg.slice(2);
    const next = cliArgs[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = 'true';
  }
  return { flags, positionals };
}

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const { flags, positionals } = parseArgs(process.argv.slice(2));
const [command = 'open', ...rest] = positionals;
const port = Number(process.env.DRAFT_PORT ?? process.env.PROTOFIELD_PORT ?? 4173);

try {
  if (command === 'export') {
    const [folder, output] = rest;
    if (!folder || !output) throw new Error(USAGE);
    await exportWorkspace(path.resolve(folder), path.resolve(output), { feedback: flags['no-feedback'] !== 'true' });
    console.log(t('cli.exported', { path: path.resolve(output) }));
  } else if (command === 'create') {
    const [folder, title] = rest;
    if (!folder) throw new Error(USAGE);
    console.log(t('cli.created', { path: await createWorkspace(path.resolve(folder), title || 'Meu espaço', { flow: flags.flow === 'true' }) }));
  } else if (command === 'inspect') {
    const discovery = await discoverExperiment(path.resolve(rest[0] ?? '.'));
    print({ generated: discovery.generated, experiment: discovery.experiment });
  } else if (command === 'context') {
    print(await buildContext(new WorkspaceStore(path.resolve(rest[0] ?? '.'))));
  } else if (command === 'feedback') {
    const [sub, folder = '.', id] = rest;
    const store = new WorkspaceStore(path.resolve(folder));
    if (sub === 'list') {
      const workspace = await store.snapshot();
      print(feedbackItems(workspace.feedback.filter(item => flags.open !== 'true' || item.status === 'open')));
    } else if (sub === 'resolve' || sub === 'reopen') {
      if (!id) throw new Error(USAGE);
      const workspace = await store.feedback({ status: sub === 'resolve' ? 'resolved' : 'open' }, id);
      print(feedbackItems(workspace.feedback.filter(item => item.id === id))[0]);
    } else throw new Error(USAGE);
  } else if (command === 'open') {
    const runtime = await startRuntime(path.resolve(rest[0] ?? '.'), port);
    console.log(`Draft: ${runtime.url}`);
    const shutdown = () => { void runtime.close().then(() => process.exit(0)); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } else if (command === 'mcp') {
    await serveMcp(path.resolve(rest[0] ?? '.'));
  } else if (command === 'presence') {
    const [sub, folder, frameId] = rest;
    if (!folder && sub !== 'list') throw new Error(USAGE);
    const store = new WorkspaceStore(path.resolve(folder || '.'));
    if (sub === 'claim') {
      const { actor } = await store.claim({ id: flags.id, label: flags.label, frameId: frameId || undefined, ttlSeconds: flags.ttl ? Number(flags.ttl) : undefined });
      print(actor);
    } else if (sub === 'clear') {
      print(await store.clearPresence(flags.id ? { id: flags.id } : (frameId !== undefined ? { frameId } : undefined)));
    } else if (sub === 'list') {
      print(await store.loadPresence());
    } else throw new Error(USAGE);
  } else throw new Error(USAGE);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
