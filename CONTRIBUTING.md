# Contributing

Thanks for helping improve Draft.

## Before you start

- Read [README.md](README.md) for the workspace model and limits.
- For a portable study folder, copy [`examples/studio/`](examples/studio/) — not the whole repository.

## Development setup

Requires Node.js 22.12+.

```bash
npm ci
npm run check
npm run build
npm test
npm run test:e2e   # needs: npx playwright install chromium
```

## Pull requests

1. Fork and branch from `main`.
2. Keep changes focused; preserve existing behavior unless the PR explains why not.
3. Add or update tests when behavior changes.
4. UI changes should be verifiable in a real browser (canvas, presentation, inspect).

## What we will not merge (yet)

- Cloud accounts, sync, or real-time collaboration
- MCP or single-vendor agent plugins
- Full CSS editor / Figma clone scope
- Breaking the portable folder format without a migration plan

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
