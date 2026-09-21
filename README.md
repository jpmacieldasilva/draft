# Draft

**Requires Node.js 22.12+** (only if you run the viewer yourself)

A portable work surface for HTML prototypes. The **folder is the product** — compare live alternatives on a canvas, point at changes, tweak type and spacing with your hands, and hand the same folder to a person or an agent.

No account. No cloud. No proprietary format.

## Start here — pick one

### I have a workspace folder (designer)

You do **not** need this repository. Copy a folder with `experiment.json` and `frames/`.

→ [Use the studio example](examples/studio/) · Ask your agent: *"Start Draft for this folder."*

→ No `npm install`. No tests.

**Quick check (manual, ~2 minutes):**

1. Copy `examples/studio/` (or your study) to a new folder.
2. Ask your agent to start Draft for that folder.
3. Interact inside a frame.
4. Inspect → change font size → Save → reload the browser tab.
5. Confirm the size stayed **in `frames/` HTML** (open the file directly if you want).

Layout, pins, and undo metadata live in `.draft/`. Inspector changes are written into the prototype files.

### I am setting up the viewer (agent / developer)

Clone this repo once to get the `draft` command, then point it at any workspace.

→ [Agent instructions](examples/studio/AGENTS.md)

```bash
npm ci
npm run build
draft inspect /path/to/workspace
draft open /path/to/workspace
```

`npm run demo` opens the included studio example.

### I am contributing code

→ [CONTRIBUTING.md](CONTRIBUTING.md) — tests and e2e live here only.

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

Save as `experiment.json`. Add `README.md` for context. Share the folder via Git, zip, or a read-only bundle:

```bash
draft export /path/to/study /path/to/bundle
```

## Limits

- Classic HTML, CSS, and local scripts in sandboxed iframes (`allow-scripts` only).
- No guaranteed support for modules, iframe storage, or network APIs.
- Visual pins record geometry at comment time; they do not follow scroll or DOM changes automatically.
- Inspector edits are written into `frames/` HTML or linked CSS — the prototype is the source of truth. Stable selectors (`data-draftroom-id`, `id`) work best.
- Read-only bundles do not persist remote feedback.

MIT License. UI built with [Astryx](https://astryxdesign.com/).
