# Workspace instructions (Draft)

This folder is a **portable Draft workspace** — prototypes and manifest only, not the viewer source code.

When the user wants to use Draft for **this folder**, follow the repository skill [`.cursor/skills/use-draft/`](../../.cursor/skills/use-draft/SKILL.md) but open **this directory** (`.`) instead of `examples/studio` or `canvas/`.

1. **Preserve** every file in this workspace. Do not delete, move, or rewrite `experiment.json`, frames, or `.draft/` without explicit permission.
2. **Validate** with `draft inspect .` when a runtime is available.
3. **Locate a runtime** (in order):
   - `draft` on `PATH`
   - `node_modules/.bin/draft` next to a Draft checkout
   - `node ../path/to/draft/dist/runtime/cli.js` from a local clone (`npm run build` first)
   - a `draft-viewer-*.tgz` tarball supplied with the workspace
4. If no runtime exists, **stop and report** what is missing. Do not install global tools or clone repos without user approval.
5. **Start** with `draft open .` (or `node …/cli.js open .`). Print the local URL and keep the process running.
6. On manifest or asset errors, show the exact message. Do not auto-fix before explaining.

## Designer prompt (copy-paste)

```text
This folder is my Draft workspace. Start the viewer for the current directory, tell me the URL, and keep it running. Do not change my prototype files.
```

## What lives here

| Path | Purpose |
| --- | --- |
| `experiment.json` | Frame list, titles, entry HTML, viewports |
| `frames/` | One folder per prototype |
| `README.md` | Context for this study |
| `.draft/` | Local layout, feedback, visual edits (optional) |

Inspector edits are written into the prototype HTML/CSS in `frames/`. Commit those files when the designer saves changes. `.draft/` holds layout, feedback, and undo baselines only.
