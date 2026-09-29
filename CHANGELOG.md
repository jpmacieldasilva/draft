# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- **Breaking:** flow connections are stored in `experiment.json` (`edges`) instead of `.draft/layout.json`, so they are shared through Git. Existing connections are migrated on open. `POST /api/edges` replaces the layout field.

### Fixed

- Inspect no longer writes into a stylesheet linked by other frames; the change goes to the edited frame's HTML.
- **Restaurar original** restores only the declarations Draft wrote and skips values changed afterwards by a person or agent. Baselines in the old whole-file format are ignored.
- Inspect refuses selectors that match more than one element (409) instead of editing the first match.
- Titles with `<`, `&` or quotes are escaped in generated HTML.
- Legacy `.draftroom/` state is migrated into `.draft/` on open; comment logs are merged by event id.
- Frames reload after atomic writes on Linux (the watcher now maps temporary file names back to the real file).

### Added

- Manifest `schemaVersion: 2`: frame `state`, `role` (control/variant), `group`, `tests`, `signal`; study `decision` (hypothesis, criteria); flow `edges`. Invalid or duplicate edges and multiple controls per group show a diagnostic instead of breaking the viewer.
- Frame badges for state and role, decision and frame metadata in the info panel, and **Comparar** (control vs. variant side by side with the criteria).
- `draft create --flow` scaffolds empty, loading, success and error states with edges.
- `draft context` includes `schemaVersion`, `decision`, `edges` and frame metadata.
- `draft context <folder>`: manifest, READMEs, frame files, open comments, active claims and emission rules in one JSON for agents.
- `draft feedback list [--open]`, `draft feedback resolve <id>` and `draft feedback reopen <id>`.
- Agent contract in `AGENTS.md` and the `use-draft` skill: read context, claim, edit `frames/<id>/`, resolve, release.
- E2E evidence harness: `e2e-evidence/evidence.json` and the Playwright report are uploaded by CI.

- Root Cursor skill `use-draft` and README agent contract: any request to use Draft triggers clone-once, build-once, open `examples/studio` or project `canvas/`.
- Public repository with MIT license and community docs.
- Workspace agent contract (`examples/studio/AGENTS.md`) and Cursor start skill.
- English README focused on folder-first workflow.
- Package rename to `draft-viewer` with `draft` CLI; state folder `.draft/` (reads legacy `.draftroom/`).
- Bifurcated README for designers vs agents vs contributors.

### Fixed

- Visual overrides now survive page reload (bridge pending queue + font shorthand handling).

### Changed

- **Breaking:** Inspector saves into prototype `frames/` HTML/CSS instead of `.draft/edits.json`. Legacy `edits.json` is migrated on open. Undo baselines live in `.draft/baselines.json`.

## [0.3.0] - 2026-09-14

### Added

- Canvas with flow connections, minimap, and viewport presets.
- Visual inspector with typography, color, and spacing overrides (`.draft/edits.json`).
- Workspace bootstrap: `create`, `inspect`, `open`, `export` CLI commands.
- **Add prototype** action in the viewer.
- Pins and region comments in `.draft/feedback.jsonl`.
- Read-only static bundle export.

### Changed

- Rebuilt viewer on React + Astryx (from legacy spike).
