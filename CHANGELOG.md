# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

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
