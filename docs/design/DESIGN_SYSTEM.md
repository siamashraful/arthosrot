# Design system

> **Purpose:** the visual language — philosophy, tokens, typography, components, and the bans.
> **Audience:** anyone building UI. **Belongs here:** the system. **Lives elsewhere:** per-screen specs (UX_PATTERNS.md), breakpoints (RESPONSIVE_BEHAVIOR.md), a11y (ACCESSIBILITY.md), rationale (brand/BRAND.md), the as-built record (DESIGN.md).

## Philosophy

Register: **product** — design serves the task. Strategy: **committed** — the bright ledger: a light cool-neutral canvas, one dark wallet card for the account's headline number, a colour-block quartet for categories, glass for the chrome. Energy is allowed in **structure and motion**; it is never allowed in **verdicts on the user's money** — green/red carry financial meaning only, and numbers are the interface. Hierarchy comes from the card, typography, and spacing, not from decoration. Broker internals (vendor ids, raw statuses, reconciliation mechanics) stay in detail views and logs.

**Bans (review-blocking):** gradient text · side-stripe accent borders · identical icon-card grids · nested cards · decorative uppercase eyebrows on every section · raw color/spacing/z literals in components (tokens only) · casino-like gamification (streaks, confetti, leaderboards) · **glass on data surfaces** (cards, tables, forms, the hero) · **pop or accent colour on a number** · **celebratory motion on financial outcomes** · data-triggered entrance animation · gain/loss colour on a control.

## Tokens

`src/styles/tokens.css` is the single source; components reference tokens only. `scripts/check-contrast.ts` parses the file as **raw text** — block order (`:root` → `[data-theme="dark"]` → `@media (prefers-color-scheme: dark)` → `[data-mode="live"]`) is load-bearing and colour tokens must be bare `oklch()` literals (no `color-mix()`, hex, or `var()`).

### Colour

| Token                                                                    | Light                                          | Dark                                           | Role                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--bg`                                                                   | oklch(0.975 0.003 250)                         | oklch(0.13 0.01 265)                           | Canvas                                                                                                    |
| `--surface` / `--surface-2`                                              | 0.995 / 0.955                                  | 0.19 / 0.25                                    | Cards / raised surfaces                                                                                   |
| `--border` / `--border-strong`                                           | 0.9 / 0.78                                     | 0.3 / 0.47                                     | Hairlines / emphasis                                                                                      |
| `--ink` / `--ink-muted`                                                  | oklch(0.185 0.012 265) / 0.45                  | oklch(0.97 0.005 265) / 0.76                   | Text and **all numbers** (≥7:1 / ≥4.5:1)                                                                  |
| `--accent` / `--accent-hover` / `--accent-soft` / `--on-accent`          | oklch(0.5 0.16 255)                            | oklch(0.72 0.13 250)                           | Links, selection, focus ring, active nav pill                                                             |
| `--pop-coral` / `-soft` / `--on-pop-coral`                               | oklch(0.56 0.185 30)                           | oklch(0.72 0.175 30)                           | Quartet — categorical only (also solid tiles)                                                             |
| `--pop-teal` / `-soft` / `--on-pop-teal`                                 | oklch(0.5 0.1 175)                             | oklch(0.75 0.12 175)                           | Quartet                                                                                                   |
| `--pop-amber` / `-soft` / `--on-pop-amber`                               | oklch(0.72 0.14 80)                            | oklch(0.83 0.15 82)                            | Quartet                                                                                                   |
| `--pop-blue` / `-soft` / `--on-pop-blue`                                 | oklch(0.5 0.16 255)                            | oklch(0.75 0.14 250)                           | Quartet                                                                                                   |
| `--hero` / `--on-hero` / `--hero-muted` / `--hero-line`                  | oklch(0.21 0.018 265) / 0.975 / 0.72 / 0.34    | oklch(0.09 0.012 265) / 0.975 / 0.74 / 0.27    | The wallet card — dark in both themes; colour discs at its corners (`--hero-blob-opacity`, practice only) |
| `--gain-on-hero` / `--loss-on-hero`                                      | oklch(0.78 0.145 160) / oklch(0.71 0.185 27)   | same                                           | Financial colour on the hero (canvas pairs fail there)                                                    |
| `--chart-line-on-hero` / `--chart-fill-on-hero` / `--chart-grid-on-hero` | 0.93 / 0.93 α.14 / 0.38                        | same                                           | The net-worth curve                                                                                       |
| `--gain` / `--loss`                                                      | oklch(0.495 0.135 158) / oklch(0.515 0.198 27) | oklch(0.775 0.145 160) / oklch(0.705 0.185 27) | Financial fact ONLY (loss also errors/destructive)                                                        |
| `--warning` / `--warning-soft`                                           | oklch(0.6 0.128 80)                            | oklch(0.815 0.14 82)                           | Staleness, degraded pipeline, caution                                                                     |
| `--focus-ring`                                                           | = accent                                       | = accent                                       | 2px ring, offset                                                                                          |
| `--chart-line` / `--chart-fill` / `--chart-grid`                         | accent / accent α.08 / 0.916                   | accent / accent α.12 / 0.3                     | Charts on the canvas                                                                                      |
| `--glass-bg` / `--glass-bg-solid`                                        | oklch(0.985 0.002 250 / 0.66) / 0.975          | oklch(0.17 0.012 265 / 0.62) / 0.19            | Glass fill / **no-filter fallback and contrast worst case**                                               |
| `--glass-border` / `--glass-highlight` / `--glass-shadow`                | ink α.12 / white α.6 / 0 8px 32px              | white α.14 / white α.16 / 0 8px 32px           | Glass edge, inset top highlight, drop                                                                     |
| `--shadow-1` / `--shadow-2` / `--shadow-hero`                            | ink-tinted α.06 / α.10 / α.25                  | black α.4 / α.5 / α.5                          | Card / raised / hero elevations                                                                           |

Live-mode overlay (`[data-mode="live"]`): `--mode-texture-opacity: 0`; `--hero-blob-opacity: 0` (the corner colour discs are practice-only); `--hero` oklch(0.13 0 0) (dark theme oklch(0.05 0 0)); `--hero-line` and `--chart-grid-on-hero` go chroma-zero. Everything else is unchanged — the mode never restyles the canvas.

### Everything else

| Group    | Tokens                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type     | `--text-xs` 12 · `-sm` 13 · `-base` 14 · `-md` 16 · `-lg` 20 · `-xl` 24 · `--text-hero` 40 (`--text-hero-wght` 700); Read: `--text-read` 17, `--text-read-lg` 22, `--leading-read` 1.65, `--leading-read-bn` 1.8, `--measure` 68ch |
| Families | `--font-ui` Anek Latin → Anek Bangla → system · `--font-bn` · `--font-mono`                                                                                                                                                        |
| Spacing  | `--space-1…7` = 4 / 8 / 12 / 16 / 24 / 32 / 48                                                                                                                                                                                     |
| Radii    | `--radius-sm` 8 · `-md` 12 · `-lg` 16 · `-panel` 24 (hero, sheets) · `-pill` 999 (buttons, nav pills, badges)                                                                                                                      |
| Motion   | `--dur-fast` 120ms · `-base` 180ms · `-slow` 320ms · `--ease-out` cubic-bezier(0.2, 0.9, 0.25, 1) · `--ease-spring` cubic-bezier(0.34, 1.4, 0.44, 1)                                                                               |
| Glass    | `--glass-blur` 14px · `--glass-saturate` 1.6                                                                                                                                                                                       |
| Mode     | `--mode-texture-opacity` 1 (practice) / 0 (live) · `--ribbon-h` 30px                                                                                                                                                               |
| Z-scale  | dropdown 10 · sticky 20 · backdrop 30 · modal 40 · toast 50 · tooltip 60 — never arbitrary values                                                                                                                                  |

## Colour rules

**BUY and SELL are neutral actions, never green/red** — side is a labeled `.segmented` control and the confirm button is the black primary pill in both cases. Gain/loss colours appear only on actual P&L, price change, success/error; every gain/loss value also carries a +/− sign (and ▲/▼ with sr-text in tables) — colour is never the sole carrier. **Pop and accent never colour a number**: a coral tile has a coral chip and a coral label and an ink number. `--hero` owns the account's primary region or is absent — no hero-coloured chips or badges. Theme via `data-theme` on `<html>`; mode via `data-mode`.

## Typography

**Anek Latin** (variable, self-hosted) for everything; `tabular-nums` via `.tabular` on every financial figure. Hero figure: `.hero-value`, 40px/700. Weights 400/500/600 elsewhere. Line heights: 1.5 prose, 1.35 headings, 1.3 tables. Financial figures: tabular, right-aligned in tables, consistent decimals (display prices 2dp; avg cost 2dp with 4dp tooltip; percents 2dp), signed values always signed. All formatting via `lib/format.ts` — components never hand-format numbers. `--font-mono` only for ids/hashes in detail views.

## Components

Global classes in `src/styles/globals.css` (native elements, no Radix):

| Class                                                                                                                          | Contract                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.hero-card` · `.hero-value`                                                                                                   | The wallet card (see DESIGN.md). One per screen; dashboard/portfolio/onboarding/live-preview only.                                                                                                      |
| `.stat-tile` `--coral` `--teal` `--amber` `--blue` · `.stat-tile-icon` · `.stat-tile-label` · `.stat-tile-value` · `.tile-row` | Icon chip on the `-soft` tint, label in the pop colour, **value in `--ink`**. Modifier = category role (assigned deliberately, consistent across screens). Mount-only staggered entrance.               |
| `.glass`                                                                                                                       | See recipe below. Chrome and overlays only.                                                                                                                                                             |
| `.btn` · `.btn-primary` · `.btn-ghost` · `.btn-danger`                                                                         | Pill-shaped, **44px min-height**; primary = `--ink` on `--bg` (inverts on the hero); ghost = transparent/border; danger = `--loss` text only on destructive confirms. `whileTap` scale 0.97 on primary. |
| `.input` · `.select` · `.field` · `.field-label` · `.field-error`                                                              | `--radius-md`, `--surface`, 44px min-height; errors linked via `aria-describedby`.                                                                                                                      |
| `.badge` `.badge-accent` `.badge-gain` `.badge-loss` `.badge-warning`                                                          | Pill; `pulse-in` on state change via `key={state}` remount.                                                                                                                                             |
| `.card`                                                                                                                        | `--surface`, `--radius-lg`, `--shadow-1`. Never nested.                                                                                                                                                 |
| `.segmented`                                                                                                                   | Labeled group of pills, `aria-pressed`; active = `--accent-soft`/`--accent`.                                                                                                                            |
| `.data-table` (`.collapsible`)                                                                                                 | `<th scope>`, `.num` right-aligned tabular; ≤767px collapses rows to `.list-row`-style two-line items.                                                                                                  |
| `.list-row`                                                                                                                    | Card-style row for activity/watchlist/collapsed tables.                                                                                                                                                 |
| `.fill-progress` · `.fill-progress-bar`                                                                                        | Caption-scale fill bar, `aria-hidden`, `currentColor`.                                                                                                                                                  |
| `.review-summary`                                                                                                              | Ticket review inset (`--surface-2`, `--radius-md`): the confirmation summary, names the account mode in words.                                                                                          |
| `.empty-state`                                                                                                                 | Teaching empty state; keeps the `mark-compact` mask.                                                                                                                                                    |
| `.skeleton`                                                                                                                    | `shimmer` keyframe over `--surface-2`; mirrors final layout.                                                                                                                                            |
| `.mode-ribbon` · `.status-banner`                                                                                              | Glass chrome. The ribbon carries the texture grain (mode signal); the banner is the degraded-pipeline notice.                                                                                           |
| `dialog.sheet`                                                                                                                 | Native `<dialog>`, glass, `sheet-up` + inner spring; `::backdrop` at `--z-backdrop`.                                                                                                                    |
| `.shell-nav` · `.nav-link` · `.bottom-nav` · `.mobile-top-bar`                                                                 | Glass chrome; `.nav-link` pills with `--accent-soft` active state and `whileTap` feedback.                                                                                                              |
| `.brand-lockup` · `.explainer` · `.auth-card`                                                                                  | Mask-rendered lockup · in-place `<details>` teaching · centered auth card using the shared `.btn`/`.input`.                                                                                             |

### The glass recipe

```css
.glass {
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    var(--glass-shadow);
}
@supports not (backdrop-filter: blur(1px)) {
  .glass {
    background: var(--glass-bg-solid);
  }
}
@media (prefers-reduced-transparency: reduce) {
  .glass {
    background: var(--glass-bg-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

Rules: applied to **sidebar, mobile top bar, bottom nav, mode ribbon, `dialog.sheet`, status banner, chart hover readout** — nothing else. Text on glass is verified against `--glass-bg-solid` (the fallback is the worst case). A glass surface never carries a financial number as its primary content. If a surface scrolls with the page, it is not glass.

## Motion

`motion@13.2.0` (ADR-012), client/UI only, under a global `<MotionConfig reducedMotion="user">`. Springs on sheet inner wrappers and `whileTap` on nav pills/primary buttons; mount-only staggered entrances on `.stat-tile` and `.list-row` (never re-triggered by data). CSS keyframes: `rise-in`, `sheet-up`, `shimmer`, `pulse-in`. Motion conveys structure and state — never decoration, never a verdict. **No celebratory motion on financial outcomes.** `prefers-reduced-motion: reduce` → instant.

Financial components under `src/components/finance` (`Money`, `Percentage`, `PriceChange` with sign + colour + arrow + sr-text, `OrderStatusBadge` for all ten lifecycle states, `FreshnessChip`, `NetWorthChart`, `TradingTicket`, `PositionsTable`, `LedgerList`, `FillProgress`) are the only path for rendering financial values. Every interactive component implements default/hover/focus-visible/active/disabled/loading; skeletons over spinners; empty states teach; one icon set (lucide-react).
