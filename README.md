# Draft

A folder of live HTML prototypes, side by side — point, tweak, share.

No account. No cloud. No proprietary format. The **folder is the product**.

![Draft canvas — three live prototypes on one board](media/canvas-v2.png)

## Try it in one minute

Requires [Node.js](https://nodejs.org/) 22.12+.

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

- **Compare** — live HTML alternatives on a local canvas (flow, minimap, viewport presets).
- **Inspect** — try type, color, and spacing on the live frame. Treat Inspect tweaks as session exploration: confirm in the HTML after reload before you trust them.
- **Comment** — pin a point or drag a region next to the pixels.
- **Share** — same folder via Git or zip; `draft export` builds a read-only bundle.

Durable workspace state (layout, pins, undo) lives in **`.draftroom/`** (the viewer may also write `.draft/` on newer runs — both are local metadata next to your study, not the product UI).

Frame HTML/CSS under `frames/` is what you ship and hand off. Edit those files (or verify them after Inspect) when you need something to survive reload.

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

## Limits

- Classic HTML, CSS, and local scripts in sandboxed iframes (`allow-scripts` only).
- No guaranteed support for modules, iframe storage, or network APIs.
- Visual pins are geometric at comment time; they do not follow scroll or DOM changes automatically.
- Prefer stable selectors (`data-draftroom-id`, `id`).
- Read-only bundles do not persist remote feedback.
- Draft stays a **local folder** — not a cloud product, vector app, or image-gen workbench.

## Developer — commands

```bash
npm ci
npm run build
draft open examples/studio    # or: npm run demo
draft create /path/to/canvas "Title"
draft inspect /path/to/workspace
draft export /path/to/study /path/to/bundle
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
