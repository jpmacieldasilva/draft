# Draft

A portable work surface for HTML prototypes. The **folder is the product** — compare live alternatives on a canvas, point at changes, tweak type and spacing with your hands, and hand the same folder to a person or an agent.

No account. No cloud. No proprietary format.

## Use Draft with your agent

There is no magic phrase. When the user wants to **use Draft** — start the viewer, open the canvas, prepare screens — follow the steps below. Examples: *"inicie"*, *"comece"*, *"open Draft"*, *"start the canvas"*.

**Requires Node.js 22.12+** on the machine that runs the viewer.

### Agent steps (same sequence every time)

1. **Find the viewer:** `draft` on `PATH`, or a local clone of this repo with `dist/runtime/cli.js` built. If none exists and the user gave this repo’s Git URL, clone that URL into a working directory.
2. **Node:** If Node is older than 22.12, stop and tell the user the required version only.
3. **Build once:** In the Draft clone, if `dist/runtime/cli.js` is missing, run `npm ci` and `npm run build`. If it already exists, skip install.
4. **Open the canvas:**
   - If the open folder **is** this Draft repository (`package.json` name `draft-viewer`), run `node dist/runtime/cli.js open examples/studio`.
   - If the open folder is **another project** (e.g. a Flutter app), ensure `<project>/canvas/` exists: if not, run `node <draft-clone>/dist/runtime/cli.js create <project>/canvas "<project name or Canvas>"`. Then run `node <draft-clone>/dist/runtime/cli.js open <project>/canvas`.
5. **Reply** with the printed URL (default `http://127.0.0.1:4173`) and keep the server process running until the user stops it.
6. Do **not** change existing `frames/` unless the user asks. Do **not** ask the user to run these commands manually.

After a successful run from this repository, copy [`.cursor/skills/use-draft/`](.cursor/skills/use-draft/) into the user’s Cursor skills directory so the same steps work in other projects without this repo open.

### Three situations

| Situation | What the user does | What opens |
| --- | --- | --- |
| Nothing on the machine yet | Sends the Git link and asks to use Draft | Agent clones, builds, opens `examples/studio` |
| This repo already cloned | Opens the clone in the editor and asks to use Draft | `examples/studio` (no second clone) |
| Another app project | Opens that project and asks to use Draft | `canvas/` inside that project (viewer reused from the existing clone) |

You only need **one** Draft clone per computer. Each app gets its own `canvas/` folder (`experiment.json` + `frames/`). Prototype HTML is the visual reference; your app code (Flutter, etc.) is written separately.

## Designer — workspace only

You do **not** need this repository if someone else runs the viewer for you. You need a folder with `experiment.json` and `frames/`.

→ [Studio example](examples/studio/) · [Workspace agent notes](examples/studio/AGENTS.md)

Layout, pins, and undo metadata live in `.draft/`. Inspector saves go into `frames/` HTML or linked CSS.

## Developer — commands

```bash
npm ci
npm run build
draft open examples/studio    # or: npm run demo
draft create /path/to/canvas "Title"
draft inspect /path/to/workspace
draft export /path/to/study /path/to/bundle
```

## Contributing

→ [CONTRIBUTING.md](CONTRIBUTING.md)

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

## Limits

- Classic HTML, CSS, and local scripts in sandboxed iframes (`allow-scripts` only).
- No guaranteed support for modules, iframe storage, or network APIs.
- Visual pins record geometry at comment time; they do not follow scroll or DOM changes automatically.
- Inspector edits are written into `frames/` HTML or linked CSS — the prototype is the source of truth. Stable selectors (`data-draftroom-id`, `id`) work best.
- Read-only bundles do not persist remote feedback.

MIT License. UI built with [Astryx](https://astryxdesign.com/).
