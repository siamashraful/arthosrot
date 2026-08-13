# Responsive behavior

> **Purpose:** how each major surface adapts structurally across breakpoints — never a shrunken desktop.
> **Audience:** UI implementers/reviewers. **Belongs here:** the adaptation matrix. **Lives elsewhere:** tokens (DESIGN_SYSTEM.md), screen content (UX_PATTERNS.md).

Breakpoints: sm 640 / md 768 / lg 1024 / xl 1280. Touch targets ≥ 44px. Respect safe-area insets (bottom nav, sheets). `inputmode="decimal"` on numeric inputs.

| Surface                   | ≥ lg                                                                 | md                                          | < md                                                                                                             |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shell                     | Fixed left sidebar (icon+label)                                      | Sidebar collapsed to icons                  | Bottom tab bar (5 tabs, 48px targets, safe-area padding) + compact top bar with search icon                      |
| Dashboard                 | 2 columns: summary + positions \| watchlist + open orders + activity | Single column                               | Single column, summary first                                                                                     |
| Tables (positions/orders) | True tables: tabular numerals, right-aligned, sortable               | Same, fewer columns                         | Each row becomes a two-line list item (symbol + qty / value + P&L) — a deliberate pattern, not horizontal scroll |
| Ledger/activity           | List grouped by day                                                  | Same                                        | Same                                                                                                             |
| Instrument page           | Chart left ⅔, trade ticket docked right ⅓                            | Chart full width, Trade button opens ticket | Same; ticket opens as a bottom sheet (Radix Dialog styled as sheet, safe-area aware)                             |
| Trading ticket            | Docked panel                                                         | Bottom sheet                                | Bottom sheet — identical fields/summary/confirm at all sizes                                                     |
| Charts                    | Height clamp 280–420px; hover crosshair + tooltip                    | Same                                        | Range selector becomes a scrollable segmented control; tap-crosshair                                             |
| Dialogs/confirmations     | Centered dialog                                                      | Centered dialog                             | Bottom sheet                                                                                                     |
| Omnisearch                | Cmd/Ctrl-K palette                                                   | Same                                        | Full-screen search from the top-bar icon                                                                         |

Rules: navigation is persistent (no hamburger-only navigation); trading actions remain fully usable on touch; the persistent PAPER badge and freshness indicators appear at every breakpoint; E2E runs both desktop and mobile viewport projects (playwright.config.ts).
