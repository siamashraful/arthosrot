# Design system

> **Purpose:** the pointer to the canonical Arthosrot Design System, its token tables as the app consumes them, the class contract, and the bans.
> **Audience:** anyone building UI. **Belongs here:** the system's values, in one place, for review. **Lives elsewhere:** the artifact itself (source of truth), per-screen specs (UX_PATTERNS.md), breakpoints (RESPONSIVE_BEHAVIOR.md), a11y (ACCESSIBILITY.md), rationale (brand/BRAND.md), the as-built mapping (DESIGN.md), the adoption decision (../architecture/adr/ADR-013-design-system-adoption.md).

## Source of truth

**The Arthosrot Design System** — a Claude Design artifact: <https://claude.ai/artifact/H15gE6qMYiLEQqbMFdiuXh> ("Arthosrot Updated Design System"). Inside its `project/`:

| File                          | Role                                                     | App copy                                                   |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `README.md`                   | The brand book: direction contract, colour, type, refuse | Summarised in brand/BRAND.md §3                            |
| `tokens.json`                 | Every token with its usage note                          | `src/styles/tokens.css` (verbatim; tables below generated) |
| `components/bundle.css`       | The component stylesheet, prefix `ar-`                   | Bottom section of `src/styles/globals.css` (verbatim)      |
| `components/<Name>/README.md` | Per-component guidelines                                 | Reflected in DESIGN.md's mapping table                     |
| `fonts/Figtree-*.woff2`       | The one family, 400 / 600 / 700                          | `public/fonts/`                                            |

**Change the artifact first, then re-copy** (procedure in ADR-013). A value that is not in the artifact is not a token. Components reference tokens only; raw colour, spacing or z-index literals in a component are review-blocking. `scripts/check-contrast.ts` parses `tokens.css` as raw text and requires bare hex literals in the checked pairs; block order (`:root` → `[data-theme="dark"]` → `@media (prefers-color-scheme: dark)` → `[data-mode="live"]`) is load-bearing.

## Philosophy

Register: **product** — design serves the task. Thesis: **colour-block clarity** — money on a calm neutral ground so the few saturated colours mean something. One near-black hero card per screen; bloom colours as category containers; lime for selection and focus; green and red for gain and loss only. Hierarchy comes from the display numeral, type and spacing, never decoration. Broker internals (vendor ids, raw statuses, reconciliation mechanics) stay in detail views and logs.

## Tokens (generated from `tokens.json`)

`{name}` means the role resolves to that literal in that theme. Ratios in the use column are the system's own measurements.

### Colour

| Token                      | Light                         | Dark                   | Use                                                                                                                          |
| -------------------------- | ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ink`                      | #121417                       | #121417                | Primary text, hero surface and primary buttons in light. Never on ink.                                                       |
| `graphite`                 | #3d434c                       | #3d434c                | Secondary text on paper and canvas (light). 9.97:1 on paper.                                                                 |
| `slate`                    | #666d7a (app; system #6b7280) | —                      | Captions, timestamps, placeholders (light). Deepened one step in the app: 4.77:1 on the canvas (see DESIGN.md).              |
| `hairline`                 | #e3e6eb                       | #e3e6eb                | Dividers, input borders, gridlines (light). Never a card border.                                                             |
| `canvas`                   | #f4f5f7                       | #f4f5f7                | App background (light). Cards sit on it without shadows.                                                                     |
| `paper`                    | #ffffff                       | #ffffff                | Cards, sheets, inputs (light). The primary button and centre tab disc in dark.                                               |
| `canvas-dark`              | #0e0f11                       | #0e0f11                | App background (dark).                                                                                                       |
| `surface-dark`             | #17191d                       | #17191d                | Cards (dark). One step above canvas-dark; no shadow.                                                                         |
| `surface-raised`           | #1f2227                       | #1f2227                | Sheets, tab bar, selected rows, toasts (dark). Two steps above canvas-dark.                                                  |
| `text-on-dark`             | #f5f6f8                       | #f5f6f8                | Primary text on dark surfaces; the portfolio line in dark charts.                                                            |
| `text-secondary-dark`      | #a5adb8                       | #a5adb8                | Secondary text on dark surfaces (7.77:1); secondary text inside the ink hero in light.                                       |
| `slate-dark`               | #8e96a3                       | #8e96a3                | Captions on dark surfaces (5.90:1 on surface-dark).                                                                          |
| `hairline-dark`            | rgba(255,255,255,0.08)        | rgba(255,255,255,0.08) | Dividers, input borders, gridlines on dark surfaces.                                                                         |
| `bg`                       | {canvas}                      | {canvas-dark}          | The app background. Use this in components, not canvas.                                                                      |
| `surface`                  | {paper}                       | {surface-dark}         | Card and input surface.                                                                                                      |
| `raised`                   | {paper}                       | {surface-raised}       | Sheets, tab bar, toasts, selected rows, keypad keys.                                                                         |
| `text`                     | {ink}                         | {text-on-dark}         | Primary text on bg, surface and raised.                                                                                      |
| `text-secondary`           | {graphite}                    | {text-secondary-dark}  | Row subtitles, descriptions, secondary values.                                                                               |
| `text-tertiary`            | {slate}                       | {slate-dark}           | Captions, timestamps, placeholders, sources on bg, surface and raised (≥4.5:1 on all; see the slate deviation in DESIGN.md). |
| `divider`                  | {hairline}                    | {hairline-dark}        | Row separators, input borders, chart gridlines.                                                                              |
| `hero`                     | {ink}                         | {surface-dark}         | The one hero card per screen.                                                                                                |
| `on-hero`                  | {paper}                       | {text-on-dark}         | Primary text and icons on the hero.                                                                                          |
| `on-hero-secondary`        | {text-secondary-dark}         | {text-secondary-dark}  | Secondary text on the hero (8.14:1 on ink; 7.77:1 on surface-dark).                                                          |
| `hero-gain`                | #12a150                       | #4db87c                | Gain on the hero: full hue on ink (5.48:1); gain-text on surface-dark.                                                       |
| `hero-loss`                | #e5484d                       | #ec767a                | Loss on the hero: full hue on ink (4.71:1); loss-text on surface-dark.                                                       |
| `hero-pill`                | rgba(255,255,255,0.12)        | rgba(255,255,255,0.10) | Quick-action pills inside the hero; label in on-hero.                                                                        |
| `primary`                  | {ink}                         | {paper}                | Primary button fill and the centre Trade tab. **Inverts in dark.**                                                           |
| `on-primary`               | {paper}                       | {ink}                  | Label and icon on primary.                                                                                                   |
| `scrim`                    | rgba(18,20,23,0.40)           | rgba(0,0,0,0.60)       | Behind sheets and dialogs.                                                                                                   |
| `pressed`                  | rgba(18,20,23,0.06)           | rgba(255,255,255,0.06) | Pressed overlay on rows and secondary buttons.                                                                               |
| `gain`                     | #12a150                       | #12a150                | Arrows, icons, chart fill (as tint), buy confirmation. 3.37:1 on paper — text under 24px uses gain-text.                     |
| `gain-tint`                | #ddf3e8                       | #163427                | Positive delta chips, the Filled tag, chart area on an up period. Text on it: gain-text.                                     |
| `gain-text`                | #0b7a3b                       | #4db87c                | Gain as text under 24px. 5.44:1 on paper, 4.68:1 on gain-tint; 5.44:1 on the dark tint.                                      |
| `loss`                     | #e5484d                       | #e5484d                | Arrows, icons, sell confirmation, destructive fill, error icons. 3.91:1 on paper — text under 24px uses loss-text.           |
| `loss-tint`                | #fde3e4                       | #402227                | Negative delta chips, error banners, chart area on a down period. Text on it: loss-text.                                     |
| `loss-text`                | #bd2e34                       | #ec767a                | Loss as text under 24px. 5.83:1 on paper, 4.80:1 on loss-tint; 5.04:1 on the dark tint.                                      |
| `on-loss`                  | #ffffff                       | #ffffff                | Label on the Destructive button (3.91:1; pair with the icon).                                                                |
| `warning`                  | #d97706                       | #d97706                | Pending states, caution: icons and the Pending tag. Text uses warning-text.                                                  |
| `warning-tint`             | #fde8d7                       | #3e2c18                | Pending tag and warning banner background.                                                                                   |
| `warning-text`             | #9a4b0a                       | #e29944                | Warning as text. 6.20:1 on paper, 5.23:1 on warning-tint.                                                                    |
| `info`                     | #2f6fe4                       | #2f6fe4                | Informational banner icon (shares the cobalt hue).                                                                           |
| `info-tint`                | #dcebff                       | #1c2a45                | Informational banner background (the practice mode ribbon).                                                                  |
| `info-text`                | #2a62cc                       | #6393eb                | Info as text. 5.65:1 on paper, 4.67:1 on info-tint.                                                                          |
| `lime`                     | #c8f53a                       | #c8f53a                | Selected tab indicator, focus ring, active toggle, chart scrubber, brand marks on ink. Never text on light, never P&L.       |
| `lime-deep`                | #5b7a00                       | #5b7a00                | Lime as text or icon on light surfaces (4.97:1 on paper).                                                                    |
| `lime-text`                | {lime-deep}                   | {lime}                 | Lime in text or icon form on the current surface.                                                                            |
| `focus`                    | {lime}                        | {lime}                 | The 2px focus ring, 2px offset, on every interactive component.                                                              |
| `cobalt`                   | #2f6fe4                       | #2f6fe4                | Stocks. Saturated tile fill (text on-bloom); icon on sky chips.                                                              |
| `sky`                      | #dcebff                       | #1c2a45                | Stocks tint: icon chips, tags, row avatars.                                                                                  |
| `violet`                   | #7c5ce6                       | #7c5ce6                | ETFs and managed portfolios. Tile fill; icon on lavender chips.                                                              |
| `lavender`                 | #e8e3fb                       | #2b2645                | ETF tint.                                                                                                                    |
| `tangerine`                | #f26b3a                       | #f26b3a                | Options. Tile fill (white 3.03:1 — heading size or larger); icon on peach via tangerine-deep in light.                       |
| `peach`                    | #fde8d7                       | #432923                | Options tint.                                                                                                                |
| `tangerine-deep`           | #b8471a                       | {tangerine}            | Options icon on peach in light (4.48:1).                                                                                     |
| `blush`                    | #e0708f                       | #e0708f                | Crypto. Tile fill (white 3.05:1); icon on rose via blush-deep in light.                                                      |
| `rose`                     | #fde7ee                       | #3f2a34                | Crypto tint.                                                                                                                 |
| `blush-deep`               | #c4557a                       | #c4557a                | Crypto icon on rose in light (3.62:1).                                                                                       |
| `mustard`                  | #f2c94c                       | #f2c94c                | Cash and savings. System allows a white-text tile (1.55:1, stated brand choice) — **the app does not use it.**               |
| `butter`                   | #fcf3d1                       | #433c26                | Cash tint (what the app's cash tile uses).                                                                                   |
| `mustard-deep`             | #7a5e00                       | {mustard}              | Cash icon on butter in light (5.51:1).                                                                                       |
| `on-bloom`                 | #ffffff                       | #ffffff                | Text on saturated bloom tiles. Passes 3:1 on cobalt (4.65), violet (4.64), blush (3.05), tangerine (3.03); not mustard.      |
| `on-cobalt` / `on-mustard` | {on-bloom}                    | {on-bloom}             | Aliases kept for older stylesheets; use on-bloom.                                                                            |
| `on-tint`                  | {ink}                         | {text-on-dark}         | Text on any tint chip. Only icons use the hue.                                                                               |
| `chart-line`               | {ink}                         | {text-on-dark}         | The portfolio line. Comparison series use cobalt and violet.                                                                 |
| `tile-track`               | rgba(255,255,255,0.35)        | rgba(255,255,255,0.35) | Progress bar track on a saturated tile.                                                                                      |

**Live-mode overlay (app addition, `[data-mode="live"]`):** `--mode-texture-opacity: 0`; `--hero: #000000` in both themes; `--on-hero-secondary` stays `#a5adb8`. Nothing else changes — the mode never restyles the canvas. Mode tokens: `--mode-texture-opacity` 1 (practice) / 0 (live); `--ribbon-h` 32px. Z-scale (app): sticky 20 · modal 40 · toast 50.

### Type

Family `--font-sans`: `"Figtree", -apple-system, system-ui, sans-serif` — weights 400, 600, 700 only. Tabular numerals on money and data.

| Style         | Size / line | Weight | Tracking | Use                                                             |
| ------------- | ----------- | ------ | -------- | --------------------------------------------------------------- |
| `display`     | 40 / 44     | 700    | −0.02em  | Hero balance, order amount in the ticket.                       |
| `title`       | 28 / 34     | 700    | −0.015em | Screen titles, stock price on detail.                           |
| `heading`     | 20 / 26     | 600    | −0.01em  | Section headings, tile balances.                                |
| `body`        | 16 / 24     | 400    | 0        | Descriptions. Under 70 characters a line.                       |
| `body-strong` | 16 / 24     | 600    | 0        | Row titles, button labels.                                      |
| `label`       | 14 / 20     | 600    | 0        | Tabs, form labels, chips, period selector.                      |
| `caption`     | 13 / 18     | 400    | 0        | Timestamps, sources, helper text.                               |
| `micro`       | 12 / 16     | 600    | 0.02em   | Tags in bloom chips, tickers. Tracking never wider than 0.04em. |

### Spacing — 4pt base; more above a heading (24) than below it (12)

| Token                  | Value | Use                                                         |
| ---------------------- | ----- | ----------------------------------------------------------- |
| `space-4`              | 4px   | Icon to label inside a chip; arrow to delta.                |
| `space-8`              | 8px   | Between chips; between stacked tags.                        |
| `space-12`             | 12px  | Below a heading; between tiles in a scroll; avatar to text. |
| `space-16`             | 16px  | Compact card padding; row vertical padding; between cards.  |
| `space-20`             | 20px  | Screen gutter and card padding.                             |
| `space-24`             | 24px  | Above a section heading; between sections inside a card.    |
| `space-32`             | 32px  | Between screen sections.                                    |
| `space-40`             | 40px  | Above the first section on a detail screen.                 |
| `space-48`             | 48px  | Empty-state illustration to copy.                           |
| `gutter`               | 20px  | Left and right screen gutter.                               |
| `card-padding`         | 20px  | Content cards, hero card, tiles.                            |
| `card-padding-compact` | 16px  | Compact list cards and insight cards.                       |

### Radius

| Token          | Value | Use                                                          |
| -------------- | ----- | ------------------------------------------------------------ |
| `radius-pill`  | 999px | Buttons, chips, tags, period selector, swipe track, toggles. |
| `radius-input` | 12px  | Inputs, keypad keys, segmented control track.                |
| `radius-chip`  | 12px  | 40px icon chips (rounded squares).                           |
| `radius-card`  | 20px  | Content cards, bloom tiles, insight cards.                   |
| `radius-hero`  | 24px  | The hero card (and the centred dialog).                      |
| `radius-sheet` | 28px  | Top corners of bottom sheets.                                |

### Shadow — no shadows on cards in either theme

| Token          | Light                          | Dark | Use                                                                         |
| -------------- | ------------------------------ | ---- | --------------------------------------------------------------------------- |
| `shadow-float` | 0 8px 24px rgba(18,20,23,0.12) | none | Sheets, the tab bar, toasts only. Never a zero-offset halo or a hard block. |

### Size

| Token            | Value  | Use                                                      |
| ---------------- | ------ | -------------------------------------------------------- |
| `icon`           | 24px   | Every icon; 1.75px stroke, rounded caps and joins.       |
| `icon-stroke`    | 1.75px | Icon stroke width.                                       |
| `icon-chip`      | 40px   | Category icon chip; radius-chip; tint fill, icon in hue. |
| `button-hero`    | 56px   | Hero and pinned buttons, swipe-to-submit, keypad keys.   |
| `button-default` | 48px   | Default buttons and inputs.                              |
| `button-compact` | 36px   | Compact buttons, filter chips, period pills.             |
| `icon-button`    | 40px   | Icon buttons (44px hit area).                            |
| `touch-target`   | 44px   | Minimum hit area for anything tappable.                  |
| `tab-bar`        | 84px   | Bottom tab bar including the 34px home indicator area.   |
| `focus-ring`     | 2px    | Focus ring width and offset, in `focus` (lime).          |

### Duration and easing — from an already visible state; reduced motion turns rolls and slides into fades

| Token           | Value                         | Use                                     |
| --------------- | ----------------------------- | --------------------------------------- |
| `duration-fast` | 150ms                         | Pressed states, chip selection, toggle. |
| `duration-base` | 250ms                         | Sheet open, tab change, swipe snap.     |
| `duration-roll` | 300ms                         | Digit roll on balance changes.          |
| `ease-out-expo` | cubic-bezier(0.16, 1, 0.3, 1) | Every transition.                       |

## Class contract

The system's `bundle.css` (verbatim in `globals.css`, prefix `ar-`; states `.is-pressed .is-focused .is-disabled .is-loading .is-selected .is-active .is-error`):

| Group        | Classes                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text         | `.ar-display` `.ar-title` `.ar-heading` `.ar-body` `.ar-body-strong` `.ar-label` `.ar-caption` `.ar-micro` · `.ar-secondary` `.ar-tertiary` `.ar-num` · `.ar-section` (heading row) · `.ar-ticker`                                                                                                                                                                               |
| Icons        | `.ar-icon` · `.ar-chipicon` (`--sm` `--xs`; `--stocks` `--etf` `--options` `--crypto` `--cash` `--gain` `--loss` `--warning` `--info` `--neutral`) · `.ar-avatar`                                                                                                                                                                                                                |
| Deltas       | `.ar-delta` `--gain` `--loss` `--chip`                                                                                                                                                                                                                                                                                                                                           |
| Buttons      | `.ar-btn` `--hero` `--compact` `--block` · `--primary` `--secondary` `--tertiary` `--destructive` · `--icon` (`--plain` `--ink` `--lg`) · `.ar-btn-row`                                                                                                                                                                                                                          |
| Inputs       | `.ar-field` `__label` `__help` · `.ar-input` (`--search`) · `.ar-amount` `__cur` `__caret` · `.ar-seg` `--block` `--pills` `__item` · `.ar-stepper` `__btn` `__value` · `.ar-toggle` `.is-on`                                                                                                                                                                                    |
| Chips / tags | `.ar-chip` `.ar-chip-row` · `.ar-tag` `--sky` `--lavender` `--peach` `--rose` `--butter` `--pending` `--filled` `--cancelled` `--neutral`                                                                                                                                                                                                                                        |
| Lists        | `.ar-list` · `.ar-row` `__main` `__title` `__sub` `__end` `__value` (`--gain` `--loss`) `__chev` · `--card` `--setting` · `.ar-group-label`                                                                                                                                                                                                                                      |
| Cards        | `.ar-card` `--compact` `--list` · `.ar-hero` `__label` `__value` `__delta` `__actions` `__pill` · `.ar-tile` `--cobalt` `--violet` `--tangerine` `--blush` `--mustard` `__head` `__name` `__value` `__return` `__bar` · `.ar-tile-row` `.ar-tile-grid` · `.ar-insight` `__label` `__value` `__head` `.ar-insight-row` · `.ar-ptile` `__head` `__name` `__value` `__foot` `__bar` |
| Navigation   | `.ar-appbar` `__title` (`--sm`) `__actions` · `.ar-greeting` · `.ar-dots` · `.ar-pinned`                                                                                                                                                                                                                                                                                         |
| Charts       | `.ar-chart` `.ar-spark` `.ar-donut` · `.ar-periods` · `.ar-legend` `__row` `__swatch`                                                                                                                                                                                                                                                                                            |
| Order ticket | `.ar-keypad` `.ar-key` · `.ar-swipe` (`--sell`) `__handle` `__label` · `.ar-ticket-row` `__label` `__value` · `.ar-success-mark`                                                                                                                                                                                                                                                 |
| Feedback     | `.ar-toast` `__action` · `.ar-banner` `--info` `--warning` `--loss` `__body` `__title` `__text` `__close` · `.ar-empty` `__art` `__title` `__text` · `.ar-skel` `--text` `--circle` `--chip` `.ar-skel-row`                                                                                                                                                                      |
| Sheets       | `.ar-sheet` `__grabber` `__title` `__text` `__actions` · `.ar-scrim` · `.ar-dialog` · `.ar-option` `__radio`                                                                                                                                                                                                                                                                     |
| Illustration | `.ar-illo`                                                                                                                                                                                                                                                                                                                                                                       |

**App-shell classes** (the product's own, same grammar): `.shell` `.shell-nav` `.shell-brand` `.shell-main` `.shell-footer` `.nav-link` (`--centre`, `.nav-disc`) `.bottom-nav` `.mobile-top-bar` · `.mode-ribbon` · `.status-banner` · `.data-table` (`.collapsible`, `.num`) · `dialog.sheet` · `.instrument-grid` `.ticket-docked` `.ticket-mobile` · `.explainer` · `.auth-shell` `.auth-brand` `.auth-card` · `.brand-lockup` · `.onboarding-card` · `.fill-progress` `.fill-progress-bar` · `.review-summary` · `.sr-only` `.tabular` `.muted` `.gain` `.loss`.

**Legacy aliases** (test selectors only; prefer `ar-`): `.card` `.btn` `.btn-primary` `.btn-ghost` `.btn-danger` `.input` `.select` `.field` `.field-label` `.field-error` `.badge` (`-accent` `-gain` `-loss` `-warning` `-beat`) `.segmented` (`--pills`) `.hero-card` `.hero-value` `.empty-state` `.skeleton` `.list-row`.

## Colour rules

**BUY and SELL are neutral actions, never green/red** — side is a labelled segmented control and the confirm is the primary pill in both cases; the destructive fill appears only at a final sell/close/cancel confirmation. Gain/loss colours appear only on P&L, price change, status tags, chart fills and confirmations; every signed value carries sign + arrow + colour (sr-only sign text where the visual is an arrow). **Bloom never colours a number or a direction; lime never colours P&L.** One hero and at most two saturated bloom blocks per screen. Theme via `data-theme` on `<html>`; mode via `data-mode`.

## Bans (review-blocking)

The system's Refuse list: gradients (including gradient text) · glass or blur as decoration · coloured left or right stripes on cards · nested cards · same-size icon-heading-text card grids as page structure · eyebrows or kicker labels · section numbering in the UI · emoji as icons · a second typeface · monospace for "technical" flavour · hard offset shadows · halo shadows · sparklines as decoration · full-screen colour tinting by portfolio direction · dark-first by default · streaks, badges, confetti, countdown pressure.

Plus the app's own: **no white text on mustard, blush or tangerine** (the axe gate, not the system, decides) · **no entrance animation on data** — nothing staggers in, nothing moves when a value refreshes · raw colour/spacing/z literals in components · gain/loss colour on a control · celebratory motion on any financial outcome or on the paper→live switch · any change that removes one of the three mode signals.

Financial components under `src/components/finance` (`Money`, `Percentage`, `PriceChange`, `OrderStatusBadge`, `FreshnessChip`, `NetWorthChart`, `TradingTicket`, `PositionsTable`, `LedgerList`, `FillProgress`) are the only path for rendering financial values. Every interactive component implements default/hover/focus-visible/active/disabled/loading; skeletons over spinners; empty states teach; one icon set (lucide-react, 24px, 1.75 stroke).
