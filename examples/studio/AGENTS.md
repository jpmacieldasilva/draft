# Workspace instructions (Draft)

This folder is a **portable Draft workspace** — prototypes and manifest only, not the viewer source code.

When the user wants to use Draft for **this folder**, follow the repository skill [`.cursor/skills/use-draft/SKILL.md`](../../.cursor/skills/use-draft/SKILL.md) but open **this directory** (`.`) instead of `examples/studio` or `canvas/`.

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

## Working on frames (contract)

Before changing anything in `frames/`, run the loop below. Every step is a CLI command, so any agent can follow it.

```bash
draft context .                                    # 1. read: manifest, READMEs, frame files, open comments, claims, rules
draft presence claim . <frameId> --label Agent     # 2. claim the frame you will edit
# 3. edit only frames/<frameId>/
draft feedback resolve . <commentId>               # 4. resolve each comment you addressed
draft presence clear . <frameId>                   # 5. release the frame
```

- Do not edit a frame whose `claimedBy` (in `draft context`) is someone else.
- Allowed in frames: classic HTML, CSS and local scripts. No ES modules and no network: CDNs, remote fonts and remote images are blocked by the viewer's CSP unless the host is listed in `allowNetwork` (e.g. `"allowNetwork": ["fonts.gstatic.com"]`).
- Put a stable `data-draftroom-id` on elements that receive comments or Inspect tweaks.
- `draft feedback list . --open` shows what is still pending.

While a claim is active, that frame shows a ring and an **Agent** pill, and Inspect is blocked (no **Salvar ajuste**) until the claim expires or is released.

## What lives here

| Path | Purpose |
| --- | --- |
| `experiment.json` | Frame list, titles, entry HTML, viewports |
| `frames/` | One folder per prototype |
| `README.md` | Context for this study |
| `.draft/` | Local layout, feedback, presence, undo baselines (optional) |

Inspect previews on the live frame. **Salvar ajuste** writes type, color, and spacing into that frame's HTML (or a stylesheet that belongs only to it). The change survives reload. Commit those files when the designer saves. `.draft/` holds layout, feedback, presence claims, and undo baselines only — not a second copy of the prototype.
