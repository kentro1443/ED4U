# ED4U Visual Design Standard

## Purpose

ED4U is a professional school operations platform. Its interface should feel precise,
reassuring and quietly premium: an environment staff can trust during a busy school day,
not a consumer social product or a generic AI dashboard.

This is the source of truth for product UI. It supersedes the earlier Cal.com-inspired
reference. Use it with the component system in `apps/web/src/components/ui`.

## Brand direction

The ED4U mark combines an open book, a learner and discreet circuit details. The UI follows
the same idea: education first, intelligence as a useful supporting layer. Cobalt blue is the
recognisable brand signal; deep navy gives the product authority; neutral surfaces let complex
school work remain legible.

**Character:** trusted, considered, modern, calm, capable.

**Never:** rainbow AI gradients, glowing orbs, decorative data visuals, heavy glass effects,
oversized pills, excessive shadows, stock-illustration hero panels, or blue used for every
surface.

## Colour system

Use blue to establish hierarchy, selection and momentum—not as background decoration.

| Token              | Value     | Use                                           |
| ------------------ | --------- | --------------------------------------------- |
| `--brand-700`      | `#1749C8` | Primary buttons, active navigation, key links |
| `--brand-600`      | `#2563EB` | Hover state, charts, interactive emphasis     |
| `--brand-100`      | `#DBEAFE` | Selected-row and active-surface fill          |
| `--brand-50`       | `#EFF6FF` | Low-emphasis informational surface            |
| `--ink`            | `#0B1220` | Headlines, high-emphasis text                 |
| `--body`           | `#334155` | Body copy and normal labels                   |
| `--muted`          | `#64748B` | Secondary labels and metadata                 |
| `--canvas`         | `#F8FAFC` | Application page floor                        |
| `--surface`        | `#FFFFFF` | Cards, inputs, menus, dialogs                 |
| `--surface-subtle` | `#F1F5F9` | Grouped controls and secondary sections       |
| `--border`         | `#E2E8F0` | Default dividers and control borders          |
| `--success`        | `#15803D` | Confirmed/success status only                 |
| `--warning`        | `#B45309` | Needs attention status only                   |
| `--danger`         | `#B91C1C` | Error, destructive actions only               |

Text must meet WCAG AA contrast (4.5:1 for normal text). Do not place normal copy over a
gradient or translucent surface.

## Typography

Use `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. It is available,
highly legible in Vietnamese, and supports data-heavy application screens. Use tabular figures
for dates, time, money, counts and IDs.

| Role           | Size / line height | Weight  | Notes                     |
| -------------- | ------------------ | ------- | ------------------------- |
| Page title     | 28px / 34px        | 700     | `letter-spacing: -0.03em` |
| Section title  | 20px / 28px        | 700     | concise, factual          |
| Card title     | 16px / 24px        | 650–700 | never oversized           |
| Body           | 14px / 22px        | 400     | default product copy      |
| Label / button | 14px / 20px        | 600     | clear verb-led wording    |
| Metadata       | 12px / 18px        | 500     | muted but readable        |

Use sentence case and Vietnamese labels that name the action clearly. Do not use all-caps
except compact, familiar codes such as room or class IDs.

## Layout and spacing

- Desktop app shell: 1,440px inspection target; content max-width 1,440px with 32px gutters.
- Mobile: 390px inspection target; 16px gutters; use agenda/card alternatives for dense tables.
- Page rhythm: 8px base unit. Common gaps are 8, 12, 16, 24, 32 and 48px.
- Separate major page regions with 32px, not decorative bands.
- Cards use 10px radius, 1px `--border` outline, white surface and at most a subtle 1–2px
  elevation. Reserve larger shadows for dialogs and menus.
- Prefer one responsive grid over nested card grids. A dashboard card must answer a real
  question or expose an immediate action.

## Navigation and hierarchy

- The persistent sidebar is a neutral operational frame. The active item uses `--brand-50`
  fill, `--brand-700` text/icon, and a 2px blue left indicator—never a loud filled blue block.
- App headers contain page context, then actions. Breadcrumbs are optional and only appear when
  they reduce ambiguity.
- One page has one primary action. Use tertiary links for low-risk alternatives; do not make
  every action a filled button.
- Place state and context nearest the data they describe. Keep filters, search and bulk actions
  together above tables.

## Components

### Buttons

- Primary: `--brand-700` background, white label, 40px standard height, 8px radius.
- Secondary: white background, `--border` border, `--ink` label.
- Tertiary: transparent, `--brand-700` label; use for inline or less-important actions.
- Destructive: white or subtle red surface until final confirmation; do not style ordinary
  navigation as destructive.
- Hover should alter colour or border and can lift by 1px. Do not scale controls or shift layout.
- Every interactive control has `:focus-visible` with a 2px `--brand-600` ring and 2px offset.

### Forms and data

- Inputs are 40px minimum height, white, 1px border, 8px radius. Labels remain visible above
  inputs; placeholders are examples, never labels.
- Show validation next to the field with an explicit recovery action.
- Tables prioritise scanability: sticky header where necessary, 44px minimum row height, numerical
  values right-aligned, and status in a dedicated column. On mobile, choose horizontal scrolling
  with pinned identity or a purpose-built card view.
- Empty states state what is empty, why it matters, and the next permitted action. Loading uses
  dimensional skeletons; errors retain the user’s context and offer retry.

### Status and intelligence

- Use semantic status badges with an icon or label; colour never carries meaning alone.
- ED4U intelligence is presented as a recommendation with evidence, constraints and a human
  decision point. Blue may identify the recommendation; it never implies certainty.
- Scores, rankings and pending states use plain language. A recommendation is not a reservation.

## Motion and accessibility

- Interaction transitions: 150–220ms; dialogs and drawers: 220–280ms. Ease out, then stop.
- Animate state change or spatial continuity only—never ambient decoration.
- Honour `prefers-reduced-motion`; transitions become near-instant and Match Space movement is
  replaced by a stable accessible list/table.
- Keyboard focus must always be visible. Dialogs trap focus and return it to the invoking control.
- Test every changed screen at 390px and 1,440px, with keyboard navigation, loading, empty and
  error states. Inspect console and network errors before marking it complete.

## Page recipes

- **Dashboard:** compact attention strip first; then only role-relevant schedule, approvals and
  upcoming work. Avoid vanity metrics.
- **Calendar / rooms:** give time and availability the strongest visual hierarchy. Use colour as a
  secondary category cue, not the sole distinction.
- **Admin lists:** dense but breathable: visible filters, reliable counts, clear bulk-action state,
  and stable column alignment.
- **Mentor / facility intelligence:** show the request and non-negotiable constraints before the
  ranked result. Use evidence panels, not decorative AI treatment.

## Delivery checklist

- Uses the tokens above; no arbitrary new blue, gray or shadow values.
- Has exactly one visual primary action per decision context.
- Uses consistent SVG icons and clear hover/pressed/disabled/focus states.
- Meets contrast requirements; text is never reliant on colour alone.
- Works at 390px, 768px, 1,024px and 1,440px without accidental horizontal overflow.
- Includes loading, empty and error behaviour and respects reduced motion.
