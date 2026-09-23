# Draft

Portable workspace for HTML prototypes. The **folder is the product**: compare live alternatives on a canvas, point at changes, adjust type and spacing, and hand the same folder to a person or an agent.

No account. No cloud. No proprietary format.

![Draft canvas — three live prototypes on one board](media/canvas-v2.png)

## Who it’s for

| You | What you need |
| --- | --- |
| **Designer** | A folder with `experiment.json` + `frames/`. Ask an agent: *“Start Draft for this folder.”* You do not need this monorepo. |
| **Agent / developer** | Clone once, `npm ci` + `npm run build`, then `draft open /path/to/workspace`. |
| **Anyone running the viewer** | [Node.js](https://nodejs.org/) 22.12+. |

## What you can do

| | |
| --- | --- |
| **Compare** | Live HTML alternatives on a local canvas (flow, minimap, viewport presets). |
| **Inspect** | Tweak type, color, and spacing; edits write into the frame HTML/CSS — the prototype is the source of truth. Layout, pins, and undo live in `.draft/`. |
| **Comment** | Pin a point or drag a region next to the pixels. |
| **Share** | Same folder via Git or zip; `draft export` makes a read-only bundle. |

![Inspect mode — edit type and spacing on the live prototype](media/inspector-v2.png)

![Comments — pins and region notes next to the prototype](media/feedback.png)

## Try it in one minute

```bash
git clone https://github.com/jpmacieldasilva/draft.git
cd draft
npm ci
npm run demo
```

Opens the included studio study (`examples/studio`). Copy that folder when you start your own work — not the whole repository.

## Use Draft with your agent

There is no magic phrase. When the user wants to **use Draft** — start the viewer, open the canvas, prepare screens — follow the steps below. Examples: *"inicie"*, *"comece"*, *"Start Draft for this folder"*, *"open Draft"*.

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

## Out of scope

Draft stays a **local folder**. It is not a cloud product, not a vector design app, not an image-gen workbench, and not a proprietary chat canvas. HTML in `frames/` remains the source of truth.

## Contributing

→ [CONTRIBUTING.md](CONTRIBUTING.md)

MIT License. UI built with [Astryx](https://astryxdesign.com/).
