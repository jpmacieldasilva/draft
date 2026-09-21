---
name: use-draft
description: Start the Draft viewer when the user wants to use Draft, open the canvas, start the viewer, or prepare prototype screens. No fixed phrase — examples include inicie, comece, open Draft, start the canvas.
---

# Use Draft

## When to use

The user wants to **use Draft**: run the viewer, open the canvas, preview or explore HTML prototypes. Match **intent**, not exact wording.

## Do not

- Edit existing `frames/` unless the user explicitly asks.
- Ask the user to run `npm ci`, `npm run build`, or `draft open` manually.
- Clone this repository again if a built clone already exists on the machine.

## Steps

1. **Find the viewer** (first match):
   - `draft` on `PATH`
   - `node_modules/.bin/draft` in a Draft checkout
   - `node <path>/dist/runtime/cli.js` where `<path>` is a Draft repo with `package.json` name `draft-viewer` and built `dist/runtime/cli.js`
   - Common locations: workspace root if this is the Draft repo; sibling `draft/`; `~/Code/draft`
   - If none exists and the user provided a Git URL for Draft, clone it (with user approval if your environment requires it).

2. **Node:** Require **22.12+**. If older, stop and state the required version only.

3. **Build once:** In the Draft clone directory, if `dist/runtime/cli.js` is missing, run `npm ci` then `npm run build`.

4. **Choose workspace folder:**
   - **Draft tool repo** (has `src/`, `tests/`, `draft-viewer` in `package.json`): workspace is `examples/studio` relative to that clone.
   - **Any other project:** workspace is `canvas/` in the project root. If `canvas/experiment.json` does not exist, run:
     `node <draft-clone>/dist/runtime/cli.js create <project-root>/canvas "<title>"`
     Use the folder or project name as title when unsure.

5. **Start:** `node <draft-clone>/dist/runtime/cli.js open <workspace-folder>`. Report the URL from stdout. Keep the process running until the user stops it.

6. **Optional — install skill for other projects:** After the first successful start from the Draft repository, copy this skill folder to the user’s personal Cursor skills directory (e.g. `~/.cursor/skills/use-draft/`) so “use Draft” works when they open unrelated projects. Skip if already present.

## Limits

- Classic HTML/CSS/JS in sandboxed iframes; modules and storage APIs are not guaranteed.
- Read-only export bundles cannot persist feedback.
- `canvas/` in an app is for prototypes only; it does not generate app code.
