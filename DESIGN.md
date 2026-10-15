# Design tokens

Closed scales for the viewer chrome (`src/viewer/style.css`, `src/viewer/flow-canvas.css`). Prototype HTML inside a frame keeps its own styles. Chrome uses these custom properties only: no one-off hues, type sizes, weights, radii, elevation shadows, or padding, gap, and margin steps.

## Type

Weights are 400 (`--weight-regular`) and 500 (`--weight-medium`). Sizes are 12, 13, 15, and 20 (`--text-12`, `--text-13`, `--text-15`, `--text-20`).

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--color-text` | `#1C1B19` | Primary text, filled actions |
| `--color-text-secondary` | `#6F6D68` | Secondary text, icons |
| `--color-border` | `#E4E2DE` | Borders and dividers |
| `--color-surface` | `#FFFFFF` | Panels, frames, menus, inputs |
| `--color-app` | `#EFEEEB` | App background and the top bar |
| `--color-canvas` | `#F6F5F3` | Canvas field, quiet fills |
| `--color-canvas-dot` | `#E7E6E3` | Canvas dots |
| `--color-accent` | `#5874A7` | Selection, focus, and the agent presence ring |

Accent is not a general action color. Mixes of these colors with transparency are allowed for rings, scrims, and floating surfaces. New hues are not.

## Radius

Chips use `--radius-chip` (6). Buttons and inputs use `--radius-button` (8). Panels, menus, sheets, and frames use `--radius-panel` (12). Circular markers — pins, connectors, selection dots — stay circular.

## Shadow

Frames use `--shadow-frame`: `0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .06)`.

Floating chrome (toolbar, minimap, panels, menus) uses `--shadow-float`: `0 4px 16px rgb(0 0 0 / .08)`.

## Spacing

`--space-4`, `--space-8`, `--space-12`, `--space-16`, `--space-24`, `--space-32`, `--space-48`, `--space-96` (4, 8, 12, 16, 24, 32, 48, 96). Padding, gap, and margin in the chrome sit on this scale. Widths, heights, and fixed positions stay with the layout.
