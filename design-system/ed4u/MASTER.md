# ED4U Design System Master

The product standard lives in [`DESIGN.md`](../../DESIGN.md). This machine-readable companion
is intentionally concise: page-specific files may refine layout, but cannot override the
accessibility, colour, typography or interaction rules in that standard.

## Tokens

| Role            | Token              | Value     |
| --------------- | ------------------ | --------- |
| Brand action    | `--brand-700`      | `#1749C8` |
| Brand hover     | `--brand-600`      | `#2563EB` |
| Brand selection | `--brand-100`      | `#DBEAFE` |
| Brand subtle    | `--brand-50`       | `#EFF6FF` |
| Ink             | `--ink`            | `#0B1220` |
| Body            | `--body`           | `#334155` |
| Muted           | `--muted`          | `#64748B` |
| Canvas          | `--canvas`         | `#F8FAFC` |
| Surface         | `--surface`        | `#FFFFFF` |
| Subtle surface  | `--surface-subtle` | `#F1F5F9` |
| Border          | `--border`         | `#E2E8F0` |

## Foundations

- Typeface: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Grid: 8px base; common spacing 8/12/16/24/32/48px.
- Radius: controls 8px; cards 10px; dialogs 12px.
- Borders: 1px solid `--border`; white cards have a single restrained elevation only when needed.
- Motion: 150–220ms for controls, 220–280ms for surfaces. Honour reduced motion.

## Rules

- Solid, high-contrast operational surfaces; no liquid glass, iridescence, ambient blur or
  decorative gradients.
- Primary buttons are blue (`--brand-700`) with white text. Orange is not an ED4U CTA colour.
- Maintain 4.5:1 contrast for normal text, always supply visible `:focus-visible`, and use SVG
  icons from one family.
- No hero-marketing layouts inside authenticated product screens. Show information, evidence and
  the next authorised action.
