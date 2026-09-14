# Draft

A portable work surface for HTML prototypes. The **folder is the product** — compare live alternatives on a canvas, point at changes, tweak type and spacing with your hands, and hand the same folder to a person or an agent.

No account. No cloud. No proprietary format.

## For designers

1. Copy a workspace folder (see [`examples/studio/`](examples/studio/)) or create one with your prototypes and `experiment.json`.
2. Ask any agent: *"Start Draft for this workspace and give me the URL."*
3. Work on the canvas. Your HTML stays in `frames/`; layout, pins, and light edits live in `.draftroom/`.

You do not need to learn the CLI. The agent starts a local server; you open the URL in the browser.

## For agents

Read [`examples/studio/AGENTS.md`](examples/studio/AGENTS.md) or the skill at `examples/studio/.cursor/skills/start-draft/SKILL.md`.

Runtime from this repository (Node.js 22.12+):

```bash
npm ci
npm run build
node dist/runtime/cli.js inspect /path/to/workspace
node dist/runtime/cli.js open /path/to/workspace
```

`npm run demo` opens the included studio example.

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
node dist/runtime/cli.js export /path/to/study /path/to/bundle
```

## Limits (honest)

- Classic HTML, CSS, and local scripts in sandboxed iframes (`allow-scripts` only).
- No guaranteed support for modules, iframe storage, or network APIs.
- Visual pins record geometry at comment time; they do not follow scroll or DOM changes automatically.
- Inspector edits are overrides in `.draftroom/edits.json` — source HTML is preserved.
- Read-only bundles do not persist remote feedback.

## Develop

```bash
npm run check
npm run build
npm test
npm run test:e2e
```

MIT License. UI built with [Astryx](https://astryxdesign.com/).
