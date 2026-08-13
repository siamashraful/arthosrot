# Design system

> **Purpose:** the visual language — philosophy, tokens, typography, components, and the bans.
> **Audience:** anyone building UI. **Belongs here:** the system. **Lives elsewhere:** per-screen specs (UX_PATTERNS.md), breakpoints (RESPONSIVE_BEHAVIOR.md), a11y (ACCESSIBILITY.md).

## Philosophy

Register: **product** — design serves the task. Strategy: **restrained** — tinted-neutral surfaces, one brand accent ≤10% of surface, semantic green/red reserved for financial meaning. The bar is _earned familiarity_: a user fluent in Linear/Stripe-class tools should trust every component. Numbers are the interface — hierarchy comes from typography and spacing, not boxes. Broker internals (vendor ids, raw statuses, reconciliation mechanics) stay in detail views and logs; the product must never feel like a developer tool.

**Bans (review-blocking):** gradient text · glassmorphism as decoration · side-stripe accent borders · the hero-metric card template · identical icon-card grids · decorative motion / orchestrated page loads · casino-like gamification · nested cards · uppercase tracked eyebrows on every section · raw color/spacing/z literals in components (tokens only).

## Color

Semantics are **mandatory**; exact OKLCH values are **provisional starting points** to be validated in the design-system phase (WCAG contrast CI script, real browser rendering, both themes, mobile + desktop).

| Token                      | Dark (provisional)   | Light (provisional)  | Role                                                        |
| -------------------------- | -------------------- | -------------------- | ----------------------------------------------------------- |
| --bg                       | oklch(0.13 0 0)      | oklch(1 0 0)         | Page background (pure neutral, chroma 0)                    |
| --surface / --surface-2    | 0.17 / 0.21, C 0     | 0.98 / 0.96, C 0     | Panels, raised surfaces                                     |
| --border / --border-strong | 0.28 / 0.38, C 0     | 0.90 / 0.82, C 0     | Hairlines, emphasis borders                                 |
| --ink                      | oklch(0.93 0 0)      | oklch(0.19 0 0)      | Primary text (≥7:1 vs bg)                                   |
| --ink-muted                | 0.72 C 0             | 0.45 C 0             | Secondary text (≥4.5:1)                                     |
| --accent                   | oklch(0.68 0.16 262) | oklch(0.52 0.18 262) | Brand blue-indigo: primary actions, selection, links, info  |
| --gain                     | oklch(0.75 0.15 155) | oklch(0.52 0.15 155) | Positive financial values ONLY                              |
| --loss                     | oklch(0.70 0.19 25)  | oklch(0.55 0.20 25)  | Negative financial values, errors, destructive actions ONLY |
| --warning                  | oklch(0.80 0.14 80)  | oklch(0.62 0.13 80)  | Staleness, degraded pipeline, caution                       |

Rules: white text on saturated fills (Helmholtz–Kohlrausch); **BUY and SELL are brand/neutral actions, never green/red** — side is a labeled segmented control, the confirm button is accent in both cases; gain/loss colors appear only on actual P&L, price change, success/error; every gain/loss value also carries a +/− sign (and ▲/▼ with sr-text in tables) — color is never the sole carrier. Theme via `data-theme` on `<html>`; components reference tokens only. Chart tokens (`--chart-line`, `--chart-gain-fill`, `--chart-loss-fill`, `--chart-grid`) derive from the same palette.

## Typography

**Inter** (variable, self-hosted via next/font) for everything — one family, product register; `tnum` + `ss01` enabled for numeric contexts via a `.tabular` utility applied by the financial components. **JetBrains Mono** only for order/venue ids in detail views. Fixed rem scale, ratio ~1.2: 12 (labels) · 13 (dense tables) · 14 (body) · 16 (emphasized) · 20 (section) · 24 (page title) · 32 (portfolio hero figure). Weights 400/500/600. Line heights: 1.5 prose, 1.35 headings, 1.3 tables. Financial figures: tabular, right-aligned in tables, consistent decimals (display prices 2dp; avg cost 2dp with 4dp tooltip; percents 2dp), signed values always signed. All formatting via `lib/format.ts` — components never hand-format numbers.

## Tokens

`src/styles/tokens.css` defines CSS custom properties; Tailwind v4 `@theme` maps them to utilities. Groups: color · spacing (4px base) · radii (4/6/10; pills only for badges) · shadows (2 subtle elevations) · type scale · breakpoints (sm 640 / md 768 / lg 1024 / xl 1280) · motion (`--dur-fast` 150ms, `--dur-base` 200ms, ease-out-quart; all gated by `prefers-reduced-motion`) · z-scale (dropdown 10 / sticky 20 / backdrop 30 / modal 40 / toast 50 / tooltip 60 — never arbitrary values).

## Components

Radix primitives, copied in under `src/components/ui` (owned in-repo): Button, Input, Select, Tabs, Dialog/Sheet, Tooltip, Badge, Alert, Toast, Popover, Skeleton, Table, EmptyState, ErrorState. Financial components under `src/components/finance`: `Money`, `Percentage`, `PriceChange` (sign + color + arrow + sr-text), `OrderStatusBadge` (all ten lifecycle states), `FreshnessChip`, `CandleChart` (lightweight-charts wrapper), `TradingTicket`, `PositionsTable`, `LedgerList`.

Conventions: every interactive component implements default/hover/focus-visible/active/disabled/loading states — no half-states shipped; skeletons over spinners; empty states teach the interface; one icon set (lucide-react); financial values render **only** through the financial components (this is what keeps formatting and accessibility uniform); motion conveys state (150–250ms), never decoration.
