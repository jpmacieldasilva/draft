# Workspace instructions (Draft)

This folder is a portable Draft workspace — prototypes and manifest only, not the viewer source code.

When the user wants to use Draft for **this folder**, follow the repository skill [`.cursor/skills/use-draft/SKILL.md`](../../.cursor/skills/use-draft/SKILL.md) but open **this directory** (`.`) instead of `canvas/`.

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
draft context .                                    # 1. read: manifest, READMEs, frame files, open comments, claims, questions, summaries, research.md, rules
draft presence claim . <frameId> --label Agent     # 2. claim the frame you will edit
# 3. edit only frames/<frameId>/
# 4. MCP ask_user when you need a decision; the answer is in the next context
# 5. MCP submit_summary with what you did and what you decided on your own
draft feedback resolve . <commentId>               # 6. resolve each comment you addressed
draft presence clear . <frameId>                   # 7. release; in a Git repo this commits frames/<frameId>/
```

- Do not edit a frame whose `claimedBy` (in `draft context`) is someone else. `ask_user`, `submit_summary` and `write_frame` return an error when another actor holds the claim.
- `ask_user` and `submit_summary` exist on MCP (`draft mcp .`), not as CLI subcommands. `ask_user` writes `frames/<frameId>/questions.json` and waits in **Precisa de você** until the answer is saved in **Status**. `submit_summary` replaces `frames/<frameId>/summary.json`. Each assumption stays `pending` until it is accepted or rejected there. Rejecting one appends an open comment; accepting does not.
- Allowed in frames: classic HTML, CSS and local scripts. No ES modules and no network: CDNs, remote fonts and remote images are blocked by the viewer's CSP unless the host is listed in `allowNetwork` (e.g. `"allowNetwork": ["fonts.gstatic.com"]`).
- Put a stable `data-draftroom-id` on elements that receive comments or Inspect tweaks.
- `draft feedback list . --open` shows what is still pending, including comments created by a rejected assumption.
- The frame badge is derived: open comment or open question → **Precisa de você**; otherwise an active claim → **Em andamento**; otherwise a non-empty summary → **Pronto**.

While a claim is active, Inspect is soft-locked on that frame (the save returns 409). The ring and **Agent** pill only signal presence — they are not the lock. Releasing with `draft presence clear` (or MCP `release`) commits `frames/<frameId>/` as `draft(<frameId>): <first line of the summary>` when the folder is a Git repository, or `draft(<frameId>): release` when there is no summary. A process exit clears presence and does not commit. Without a `.git` directory the viewer shows **Sem Git**, history is unavailable, and nothing is committed.

## What lives here

| Path | Purpose |
| --- | --- |
| `experiment.json` | Frame list, titles, entry HTML, viewports, roles, decision, edges |
| `frames/<id>/` | One folder per prototype. `questions.json` and `summary.json` live here when an agent asks or summarizes |
| `research.md` | Optional study notes. Shown on the canvas and included in `draft context` (omitted above 100,000 characters) |
| `README.md` | Context for this study |
| `.draft/` | Local layout, feedback, presence, undo baselines (optional) |

Inspect explores the live iframe. The preview stays local until **Salvar** writes fill, border, padding, gap and the other allowed properties into that frame's HTML (a stylesheet shared with another frame is left untouched). In a Git repository that save is the commit `draft(<id>): salvar ajuste`, limited to the files the tweak changed. **Restaurar original** is `draft(<id>): restaurar original`. `.draft/` holds layout, feedback, presence claims, and undo baselines only — not a second copy of the prototype.
