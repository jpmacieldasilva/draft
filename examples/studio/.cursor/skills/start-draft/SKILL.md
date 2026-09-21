---
name: start-draft
description: Start the Draft viewer for a portable HTML prototype workspace folder. Use when the user asks to open Draft, start the viewer, or preview prototypes in a folder with experiment.json.
---

# Start Draft for this workspace

## When to use

The working directory contains `experiment.json` (or a root `index.html`) and is a **workspace**, not the Draft tool repository (`src/`, `tests/`).

## Steps

1. Confirm this is a workspace — look for `experiment.json` or `frames/`.
2. Do not modify workspace files unless the user explicitly asks.
3. Find a runtime:
   - `draft` on PATH
   - `node_modules/.bin/draft` in a Draft checkout
   - `node <draft-repo>/dist/runtime/cli.js` after `npm run build` in that repo
   - `draft-viewer-*.tgz` installed offline
4. Run `draft inspect .` when available.
5. Run `draft open .` and report the URL (default `http://127.0.0.1:4173`).
6. Keep the server process running until the user stops it.

## If runtime is missing

Tell the user they need the Draft runtime (Node 22.12+, clone or tarball). Offer to build from a sibling checkout only with permission.

## Limits

- Classic HTML/CSS/JS in sandboxed iframes; no guaranteed module or storage APIs.
- Read-only bundles cannot persist feedback.
