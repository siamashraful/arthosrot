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

| Piece                           | Implementation                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.field-panel`                  | The dyed cloth: `--field` bg, `--radius-panel` 14px, warp layer via `::before` `repeating-linear-gradient` at `--warp-pitch`, opacity `--warp-opacity`. **`--warp-opacity` IS the paper/live mode signal (BRAND.md §5, ADR-011) — never restyle it away.**                                                                                                                                          |
| Where the field lives           | Dashboard account summary · portfolio summary · onboarding panel (both states) · the mode ribbon (it IS the mode signal, so it wears the mode's cloth). Nowhere else.                                                                                                                                                                                                                                |
| `ModeRibbon`                    | The persistent mode label (`role="note"`), woven on the mode's field at half the loom pitch; warp rides `--warp-opacity` so texture/depth/label switch together via `[data-mode="live"]`. Height `--ribbon-h` (the shell subtracts it). Practice: "Practice — simulated money" / live preview: "Live preview — real trading isn't available yet". Non-removable (SECURITY.md control 5).            |
| `TradingModeSwitch`             | Settings segmented group (aria-pressed) + confirm sheet on live entry (names the mode in words, neutral copy — the graduation must not flatter). Sets `localStorage["trading-mode"]` + `data-mode` on `<html>`; `useTradingMode()` reads it via `useSyncExternalStore` + MutationObserver.                                                                                                            |
| `LiveDashboard` / `LiveEmptyState` | Live-preview surfaces: live's OWN empty states — paper data never renders under `data-mode="live"`. Every account-data page gates on `useTradingMode()`.                                                                                                                                                                                                                                          |
| `FundingSheet`                  | Deposit/withdraw sheets (native `<dialog class="sheet">`): amount field (display-only), disabled funding-source row, always-disabled primary action + "no money moves" note. The UI half of the `core/funding` FundingProvider port.                                                                                                                                                                 |
| `.brand-lockup` / `.brand-mark` | CSS `mask` over `public/brand/*.svg`, `background-color: currentColor` — theme-aware with zero variants. Sidebar 34px, mobile bar 26px, auth 44px.                                                                                                                                                                                                                                                  |
| Favicon                         | `src/app/icon.svg` — compact mark with embedded `prefers-color-scheme` colors.                                                                                                                                                                                                                                                                                                                      |
| Radii                           | Panels `--radius-panel` 14px; controls/cards `--radius-sm/md/lg` 3/6/10; **rows and threads square** (`--radius-row: 0`).                                                                                                                                                                                                                                                                           |
| Motion                          | The reed's beat: snap-and-settle, `--dur-fast` 120ms, `--ease-out` cubic-bezier(0.2,0.9,0.25,1). Three keyframes only — `reed-beat` (badge state change via `key={state}` remount, sheet open), `reed-lay` (a newly laid weave pick), `warp-sweep` (skeleton shimmer). No celebratory motion, no entrance animation on data, no fades between order states, reduced-motion → instant (global rule). |
| `WeaveFill`                     | Fill progress in the loom's grammar: hairline warp + laid picks at caption scale (72×8px), `aria-hidden` (the `n/n` text carries meaning), `currentColor` picks (inherits on-field). Used in the orders table, ticket chip, and order detail.                                                                                                                                                       |
| `Explainer`                     | In-place teaching: native `<details>`, collapsed, quiet (`--ink-muted`, text-sm, square marker). Copy voice: mechanism, never outcomes. Topics: buying-power, partial-fill, lifecycle.                                                                                                                                                                                                              |
| `NetWorthChart`                 | The equity curve on the dyed field: chalk line + faint chalk fill (`--chart-*-on-field` tokens, contrast-gated), no gridlines (the warp is the texture), range tabs, sr data table. Delta line uses gain/loss classes with sr sign text.                                                                                                                                                            |
| `SymbolLogo`                    | 20px logo tile via the authed `/api/v1/logos/` proxy; monogram fallback (first char on `--surface-2`) is the designed offline/dev state. Decorative (`aria-hidden`) — the symbol text carries meaning.                                                                                                                                                                                              |
| Loom slider                     | Onboarding range input: warp-hairline track, laid-weft fill via `--fill-pct` (component-set), chalk shuttle thumb. `accent-color` fallback where pseudo-elements are unsupported.                                                                                                                                                                                                                   |

## Verification contract

Any styling change must keep green: `pnpm check:contrast` (never weaken pairs — extend them), the axe scans inside `pnpm test:e2e`, and both themes at 390px and 1360px. The warp, the open corner of the mark, and the bilingual lockup spacing are identity — not available for "cleanup."
