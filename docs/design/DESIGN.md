# DESIGN.md — Arthosrot

> **Purpose:** the durable visual decisions as BUILT — ground truth for anyone styling a surface.
> **Audience:** every design/UI session. **Rationale lives in** [brand/BRAND.md](brand/BRAND.md); component rules in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); a11y method in [ACCESSIBILITY.md](ACCESSIBILITY.md).

## The world

**The Dhakai jamdani loom.** One dyed teal-navy field carries the surface's primary region; a hairline warp on a fixed pitch is a real drawn layer; the mark is a square of plain weave with one corner still open. Recognizable with all content removed: dyed field + warp hairlines + the float.

Register: **Operate** — design serves the task; brand lives in precise details, never in decoration over data.

## Type

- **Anek Latin** (Ek Type, OFL), variable `wght 100–800 · wdth 75–125`, self-hosted at `public/fonts/AnekLatin-var.woff2`, `font-display: swap`. Body = `var(--font-ui)`.
- Bengali renders **only** as outlined vector inside the brand SVGs — never live `<text>` (conjunct shaping; BRAND.md §7). `--font-bn` exists for future Bengali UI text and falls back to system Bengali faces.
- Numerals: `tabular-nums` via `.tabular`, verified present in the font.
- Scale unchanged from the pre-brand system (12→32px, `--text-*`); Read register tokens (`--text-read`, `--measure`) exist but no Read surface is built yet.

## Color

Strategy: **Committed** — the field owns whole regions or is absent.

- Tokens: `src/styles/tokens.css` (OKLCH, light + dark + `prefers-color-scheme` fallback). Every load-bearing pair is machine-checked by `scripts/check-contrast.ts` (36 pairs incl. the on-field set).
- **The three colour laws** (BRAND.md §6, enforced in review):
  1. `--accent` never on a number.
  2. `--gain`/`--loss` never on a control — BUY is not green, SELL is not red.
  3. `--field` owns a whole region or is absent; **one dyed panel per screen**.
- On the field: text `--on-field`, secondary `--field-muted`, financial colour `--gain-on-field`/`--loss-on-field` (the base pairs fail there — measured). Controls on the field are **chalk on dye**: `.field-panel .btn-primary` inverts to on-field/field; range inputs take `accent-color: var(--on-field)`.

## Components (as built)

| Piece                           | Implementation                                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.field-panel`                  | The dyed cloth: `--field` bg, `--radius-panel` 14px, warp layer via `::before` `repeating-linear-gradient` at `--warp-pitch`, opacity `--warp-opacity`. **`--warp-opacity` is reserved as the future paper/live mode signal (BRAND.md §5) — never restyle it away.** |
| Where the field lives           | Dashboard account summary · portfolio summary · onboarding panel (both states). Nowhere else.                                                                                                                                                                        |
| `.brand-lockup` / `.brand-mark` | CSS `mask` over `public/brand/*.svg`, `background-color: currentColor` — theme-aware with zero variants. Sidebar 34px, mobile bar 26px, auth 44px.                                                                                                                   |
| Favicon                         | `src/app/icon.svg` — compact mark with embedded `prefers-color-scheme` colors.                                                                                                                                                                                       |
| Radii                           | Panels `--radius-panel` 14px; controls/cards `--radius-sm/md/lg` 3/6/10; **rows and threads square** (`--radius-row: 0`).                                                                                                                                            |
| Motion                          | The reed's beat: snap-and-settle, `--dur-fast` 120ms, `--ease-out` cubic-bezier(0.2,0.9,0.25,1). No celebratory motion, no entrance animation on data, reduced-motion → instant.                                                                                     |

## Verification contract

Any styling change must keep green: `pnpm check:contrast` (never weaken pairs — extend them), the axe scans inside `pnpm test:e2e`, and both themes at 390px and 1360px. The warp, the open corner of the mark, and the bilingual lockup spacing are identity — not available for "cleanup."
