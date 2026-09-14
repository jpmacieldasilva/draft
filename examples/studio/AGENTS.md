# Workspace instructions (Draft)

This folder is a **portable Draft workspace** — prototypes and manifest only, not the viewer source code.

When the user asks to open or start Draft:

1. **Preserve** every file in this workspace. Do not delete, move, or rewrite `experiment.json`, frames, or `.draftroom/` without explicit permission.
2. **Validate** with `protofield inspect .` when a runtime is available.
3. **Locate a runtime** (in order):
   - `protofield` on `PATH`
   - `node_modules/.bin/protofield` next to a Draft checkout
   - `node ../path/to/draft/dist/runtime/cli.js` from a local clone (`npm run build` first)
   - a `protofield-*.tgz` tarball supplied with the workspace
4. If no runtime exists, **stop and report** what is missing. Do not install global tools or clone repos without user approval.
5. **Start** with `protofield open .` (or `node …/cli.js open .`). Print the local URL and keep the process running.
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
| `.draftroom/` | Local layout, feedback, visual edits (optional) |

The HTML source is never rewritten by the viewer; overrides stay in `.draftroom/edits.json`.
