# Draft

A folder of live HTML prototypes, side by side — point, tweak, share.

No account. No cloud. No proprietary format. The **folder is the product**.

![Draft canvas — three live prototypes on one board](media/canvas-v2.png)

## Try it in one minute

Requires [Node.js](https://nodejs.org/) 22.12+.

```bash
npx draft-viewer create my-study "My study"
npx draft-viewer open my-study
```

Or run the included studio from a clone:

```bash
git clone https://github.com/jpmacieldasilva/draft.git
cd draft
npm ci
npm run demo
```

Opens the included studio study (`examples/studio`). Copy that folder when you start your own work — not the whole repository.

## What you get

![Inspect mode — try type and spacing on the live frame](media/inspector-v2.png)

![Comments — pins and region notes next to the prototype](media/feedback.png)

- **Compare** — live HTML alternatives on a local canvas (flow, minimap, viewport presets). When a group has a control and a variant, **Comparar** shows them side by side; each pane repeats the role and the decision (hypothesis and criteria).
- **Inspect** — try type, color, fill, border, padding and gap on the live frame. The preview is temporary. The bar shows **Não salvo**, **Reset** (drops the preview) and **Salvar** (accessible name **Salvar ajuste**), which writes the change into that frame's HTML and never into a stylesheet shared with other frames. Setting a border width also sets a solid border when the current style is missing or `none`; setting gap sets `display: flex` unless the element is already flex or grid. **Restaurar original** writes the file back byte for byte when it still holds exactly what Draft last wrote and no other saved tweak touches that file; otherwise it removes only the declarations Draft wrote, so a later edit in the same file survives. An active agent claim blocks Inspect: the panel locks and the save returns 409.
- **Status** — the frame badge is derived. An open comment or an unanswered agent question shows **Precisa de você**. Otherwise an active claim shows **Em andamento**. Otherwise a submitted summary shows **Pronto**. With none of those, there is no activity badge. **Status** answers questions and accepts or rejects each assumption. Rejecting one opens a comment on the frame; accepting does not.
- **History** — in a Git repository, the frame menu lists commits that touch `frames/<id>/`, shows the diff, and can restore that version as a new commit `draft(<id>): restaurar <sha>`. Without Git, the top bar shows **Sem Git** and history says it is unavailable; the canvas keeps working.
- **Código** — switches that frame to a read-only view of its HTML. **Prévia** returns to the live iframe.
- **Conectar agente** — copies a stdio MCP command for Claude Code, Cursor, Codex, or a manual client, already pointed at this workspace folder. Read-only export bundles omit that absolute path.
- **Comment** — pin a point or drag a region next to the pixels.
- **Present the flow** — in presentation mode, arrow keys follow `edges` (← goes back), the bar lists the next steps, and any element with `data-draft-goto="<frameId>"` inside a prototype jumps to that frame. On the canvas the same link selects and centers the target.
- **Share** — same folder via Git or zip; `draft export` builds a read-only bundle with the flow and the comments (add `--no-feedback` to leave comments out).

Local state (canvas layout, comments, presence, undo baselines) lives in `.draft/`. Folders from older versions with `.draftroom/` are migrated on open. Questions (`frames/<id>/questions.json`), summaries (`frames/<id>/summary.json`) and an optional `research.md` at the workspace root travel with the folder. `research.md` is shown on the canvas and included in `draft context`; above 100,000 characters it is omitted and a notice is shown.

Frame HTML/CSS under `frames/` is what you ship and hand off. Edit those files (or verify them after Inspect) when you need something to survive reload.

When the folder is a Git repository, saving or restoring an Inspect tweak commits only the files that tweak touched (`draft(<id>): salvar ajuste` or `draft(<id>): restaurar original`). Releasing a claim (`draft presence clear` or MCP `release`) commits `frames/<id>/` as `draft(<id>): ` plus the summary's first line, or `release` when there is no summary. Shutting down the process clears presence and does not commit. Without Git, the same writes still happen and no commit is created.

## Designer — workspace only

You do **not** need this repository if someone else runs the viewer. You need a folder with `experiment.json` and `frames/`.

Ask any agent: *“Start Draft for this folder.”*

→ [Studio example](examples/studio/) · [Workspace agent notes](examples/studio/AGENTS.md)

## Portable workspace

```json
{
  "id": "my-study",
  "title": "My study",
  "frames": [
    {
      "id": "first",
      "title": "First alternative",
      "entry": "frames/first/index.html",
      "viewport": { "width": 390, "height": 620 }
    }
  ]
}
```

Save as `experiment.json` next to `frames/`.

### Flows, states and decisions (`schemaVersion: 2`)

Everything that matters for the study lives in the manifest, so it travels with Git:

```json
{
  "schemaVersion": 2,
  "decision": { "hypothesis": "One text at a time increases completed reads.", "criteria": "More completed reads per session." },
  "frames": [
    { "id": "checkout", "title": "Checkout", "entry": "frames/checkout/index.html", "viewport": { "width": 390, "height": 620 },
      "state": "ready", "role": "control", "group": "checkout", "tests": "Current layout.", "signal": "checkout_completed" },
    { "id": "checkout-error", "title": "Card declined", "entry": "frames/checkout-error/index.html", "viewport": { "width": 390, "height": 620 },
      "state": "error" }
  ],
  "edges": [{ "from": "checkout", "to": "checkout-error", "label": "card declined" }]
}
```

- `state` — any short name (empty, loading, error, success…). Shown as a badge on the frame.
- `role` — `control` or `variant`, per `group`. When a group has a control and a variant, **Comparar** shows them side by side. The header and each pane show the decision hypothesis and criteria.
- `edges` — the flow drawn on the canvas. Connections you draw in the viewer are saved here. Older folders that kept them in `.draft/layout.json` are migrated on open.
- `draft create <folder> "Title" --flow` starts with empty → loading → success / error states already linked.
- Manifests without `schemaVersion` still open unchanged; the first write from Draft adds `schemaVersion: 2`. Fields Draft does not know are preserved.

### Remote assets (`allowNetwork`)

Frames run under a strict CSP: by default nothing is loaded from the network. When a prototype needs a web font, a CDN image or an API, list the hosts:

```json
{ "allowNetwork": ["fonts.googleapis.com", "fonts.gstatic.com", "*.example.org"] }
```

Each entry must be a bare hostname or `*.domain`; it is allowed over `https://` for scripts, styles, images, fonts, media and `fetch`. Anything else (`*`, `http://…`, `data:`, CSP keywords) is ignored with a notice. When a frame tries to load a host that is not listed, the frame shows which host was blocked.

### Language

The viewer, the CLI and the agent rules speak Brazilian Portuguese (default) and English. `DRAFT_LANG=en draft open .` picks English for one person; `"locale": "en"` in `experiment.json` sets it for the study. Validation errors from the runtime stay in Portuguese.

## Limits

- Classic HTML, CSS, and local scripts in sandboxed iframes (`allow-scripts` only).
- No guaranteed support for modules or iframe storage; network only for hosts in `allowNetwork`.
- Visual pins are geometric at comment time; they do not follow scroll or DOM changes automatically.
- Prefer stable selectors (`data-draftroom-id`, `id`).
- Read-only bundles show comments but cannot create or resolve them.
- Draft stays a **local folder** — not a cloud product, vector app, or image-gen workbench.

## Developer — commands

```bash
npm ci
npm run build
draft open examples/studio    # or: npm run demo
draft create /path/to/canvas "Title"
draft inspect /path/to/workspace
draft context /path/to/workspace          # what an agent should read before editing
draft feedback list /path/to/workspace --open
draft feedback resolve /path/to/workspace <comment-id>
draft export /path/to/study /path/to/bundle [--no-feedback]
draft mcp /path/to/workspace              # MCP server over stdio
```

### MCP

`draft mcp <folder>` exposes the same contract as the CLI to any MCP client, plus two tools the CLI does not have: `ask_user` and `submit_summary`. The full set is `get_context`, `list_frames`, `get_selection` (what is selected in the viewer right now), `claim` / `release`, `ask_user`, `submit_summary`, `read_frame` / `write_frame` (only inside `frames/<id>/`, never over another actor's claim), `resolve_feedback` and `update_manifest` (validated; unknown fields preserved).

`ask_user` appends a question to `frames/<id>/questions.json`. It shows up under **Precisa de você** until someone answers it in **Status**; the answer comes back on the next `get_context`. `submit_summary` replaces `frames/<id>/summary.json` with what the agent did and a list of assumptions (`pending` until accepted or rejected in **Status**). Both return 409 when another actor holds the claim. `release` clears this agent's claim and, in a Git repository, commits that frame's folder.

```json
{ "mcpServers": { "draft": { "command": "npx", "args": ["-y", "draft-viewer", "mcp", "/path/to/workspace"] } } }
```

## Use Draft with your agent

There is no magic phrase. When the user wants to **use Draft** — start the viewer, open the canvas, prepare screens — follow the steps below. Examples: *"inicie"*, *"comece"*, *"Start Draft for this folder"*, *"open Draft"*.

**Requires Node.js 22.12+** on the machine that runs the viewer.

1. **Find the viewer:** `draft` on `PATH`, or a local clone of this repo with `dist/runtime/cli.js` built. If none exists and the user gave this repo’s Git URL, clone that URL into a working directory.
2. **Node:** If Node is older than 22.12, stop and tell the user the required version only.
3. **Build once:** In the Draft clone, if `dist/runtime/cli.js` is missing, run `npm ci` and `npm run build`. If it already exists, skip install.
4. **Open the canvas:**
   - If the open folder **is** this Draft repository (`package.json` name `draft-viewer`), run `node dist/runtime/cli.js open examples/studio`.
   - If the open folder is **another project** (e.g. a Flutter app), ensure `<project>/canvas/` exists: if not, run `node <draft-clone>/dist/runtime/cli.js create <project>/canvas "<project name or Canvas>"`. Then run `node <draft-clone>/dist/runtime/cli.js open <project>/canvas`.
5. **Reply** with the printed URL (default `http://127.0.0.1:4173`) and keep the server process running until the user stops it.
6. Do **not** change existing `frames/` unless the user asks. Do **not** ask the user to run these commands manually.

After a successful run from this repository, copy [`.cursor/skills/use-draft/`](.cursor/skills/use-draft/) into the user’s Cursor skills directory so the same steps work in other projects without this repo open.

| Situation | What the user does | What opens |
| --- | --- | --- |
| Nothing on the machine yet | Sends the Git link and asks to use Draft | Agent clones, builds, opens `examples/studio` |
| This repo already cloned | Opens the clone and asks to use Draft | `examples/studio` (no second clone) |
| Another app project | Opens that project and asks to use Draft | `canvas/` inside that project (viewer reused) |

One Draft clone per computer. Each app gets its own `canvas/` (`experiment.json` + `frames/`).

## Contributing

→ [CONTRIBUTING.md](CONTRIBUTING.md)

MIT License. UI built with [Astryx](https://astryxdesign.com/).
