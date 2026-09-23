import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceStore } from '../src/runtime/workspace.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'draft-presence-'));
  await mkdir(path.join(root, 'frames/one'), { recursive: true });
  await writeFile(path.join(root, 'frames/one/index.html'), '<html><body><h1 id="t">Olá</h1></body></html>');
  await writeFile(path.join(root, 'experiment.json'), JSON.stringify({
    id: 'test', title: 'Test',
    frames: [{ id: 'one', title: 'One', entry: 'frames/one/index.html', viewport: { width: 800, height: 600 } }],
  }));
  return root;
}

describe('Presence soft-lock', () => {
  test('claim blocks saveEdit until clear', async () => {
    const root = await fixture();
    try {
      const store = new WorkspaceStore(root);
      await store.claim({ label: 'Agent', frameId: 'one', ttlSeconds: 120 });
      await assert.rejects(
        store.saveEdit({ frameId: 'one', selector: '#t', styles: { fontSize: '20px' } }),
        /Agent está neste frame/,
      );
      await store.clearPresence({ frameId: 'one' });
      await store.saveEdit({ frameId: 'one', selector: '#t', styles: { fontSize: '20px' } });
      const html = await readFile(path.join(root, 'frames/one/index.html'), 'utf8');
      assert.match(html, /20px|font-size/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('expired claim does not block saveEdit', async () => {
    const root = await fixture();
    try {
      const store = new WorkspaceStore(root);
      await store.claim({ label: 'Agent', frameId: 'one', ttlSeconds: 1 });
      const presence = await store.loadPresence(true);
      await store.savePresence({
        actors: presence.actors.map(a => ({ ...a, expiresAt: new Date(Date.now() - 1000).toISOString() })),
      });
      await store.saveEdit({ frameId: 'one', selector: '#t', styles: { fontSize: '18px' } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
