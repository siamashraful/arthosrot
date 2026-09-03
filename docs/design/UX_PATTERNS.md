# UX patterns & screen specs

> **Purpose:** wireframe-level intent for each major surface + the standing state catalog every page must implement.
> **Audience:** UI implementers before building any screen. **Belongs here:** screen behavior + states. **Lives elsewhere:** visual system (DESIGN_SYSTEM.md), breakpoints (RESPONSIVE_BEHAVIOR.md).

## Information architecture

Five sections — Dashboard `/` · Markets `/markets`, `/i/[symbol]` · Portfolio `/portfolio` · Orders `/orders` · Activity `/activity`. Account/settings via the sidebar (desktop) and the compact top-bar icons (mobile). Global: omnisearch (Cmd/Ctrl-K — **post-MVP**; mobile reaches search via the top-bar icon), the persistent **mode ribbon** ("Practice — simulated money" / "Live preview — real trading isn't available yet"), market status + data freshness in the shell, and a quiet glass **status banner** when the event pipeline degrades ("Order updates may be delayed — last sync 14:02 ET", driven by `/api/v1/system/status`).

## Screens

- **Dashboard:** the **hero card** = portfolio value (`.hero-value`, 40px/700) + day change (signed, `--gain-on-hero`/`--loss-on-hero`, sr sign text) + the net-worth curve with range tabs; below it a `.tile-row` of stat tiles — cash (teal), buying power (blue), day change (amber label, ink number), open orders (coral) — roles fixed, never coloured by position; then positions (top 5 + link), watchlist, open orders, recent activity as `.list-row` sections. Empty state teaches: "Search a symbol to place your first paper trade" with inline search. Under `data-mode="live"` the hero and tiles render live's own $0.00 empty states.
- **Instrument page:** header: SYMBOL · `SymbolLogo` chip · name · **Bid / Ask / Last** with sizes · signed change · freshness chip ("IEX · 12s ago" / "Market closed · at close"); chart with range tabs (1D–5Y); "Your position" strip if held (account data visually separated from market data); Trade ticket/button. Execution price on order detail is visibly distinct from displayed quote ("Filled at 200.13 · quoted 200.10 at submit") — never a fabricated explanation for the difference.
- **Trading ticket:** `.segmented` **Buy/Sell** (labeled, neutral) → type (Market/Limit) → qty stepper/input → limit price (limit only) → live estimate block (est. value using ask for buys / bid for sells, est. fees, buying power remaining or sellable shares) → Review → `.review-summary` ("Buy 10 AAPL · Market · est. $2,000.00 · Practice account — simulated money") → single black primary pill Confirm. Disabled states always carry a reason. On submit, the ticket closes into an order chip showing **Pending** with a `FillProgress` bar that advances live — never optimistic FILLED, never a success flourish on fill.
- **Orders:** tabs Open / History; rows: side, symbol, `FillProgress` + filled/total qty, type + limit, `OrderStatusBadge` (Pending, Open, Partially filled, Filled, Cancelling, Cancelled, Rejected, Expired, Failed to submit; `pulse-in` on change), time; inline cancel with confirm sheet. Detail: canonical event timeline (source-labeled: broker / local / inferred / reconciliation) + fills + venue reject reason when present.
- **Portfolio:** hero card summary; positions table (symbol, qty, avg cost, price, market value, day change, unrealized P&L $ and %, weight); realized P&L section; allocation as a single horizontal stacked bar (no pie; segments use pop tints per position, values in ink).
- **Activity:** `.list-row` ledger grouped by day; each entry: type chip, description ("Bought 10 AAPL @ 200.00"), signed amount, links to the causing order; access to archived-account history after resets.
- **Auth:** minimal centered `.auth-card`; paper-trading disclosure at signup.
- **Settings:** display name, theme, trading-mode switch (confirm sheet names the mode in words; neutral copy, no flourish), account reset (type-to-confirm; explains archival).

## Motion patterns

| Pattern             | Behavior                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet open/close    | Native `<dialog>` shows instantly; the inner wrapper springs up (`--ease-spring`, ~`--dur-slow`); backdrop fades `--dur-base`. Close is faster than open. |
| Tap feedback        | Nav pills and primary buttons scale to 0.97 while pressed; release springs back. Nothing else reacts to press.                                            |
| Tile / row entrance | `rise-in` staggered ~40ms per item, **mount only**. Data refreshes, sorts, and filters never re-run it.                                                   |
| Status change       | `OrderStatusBadge` remounts on `key={state}` with `pulse-in` — a state either is or is not; no crossfade between states.                                  |
| Skeleton            | `shimmer` over `--surface-2`, mirroring the final layout.                                                                                                 |
| Forbidden           | Anything that reacts to a fill, a gain, a loss, or the paper→live switch with celebration — confetti, count-ups, glows, streak badges.                    |
| Reduced motion      | All of the above are instant.                                                                                                                             |

## Status banner

Glass strip (`.status-banner`, `role="status"`) directly under the mode ribbon; appears when `/api/v1/system/status` reports a degraded pipeline and stays until it clears. Copy names the condition and the last sync time. It never auto-dismisses and never animates beyond `rise-in` on first appearance; order rows show their last-synced context while it is visible.

## Standing state catalog (every page)

| State              | Behavior                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Initial load       | Route-level `.skeleton`s mirroring final layout — no blank screens, no layout shift              |
| Background refresh | Quiet stale-while-revalidate; no motion on the updated value                                     |
| Partial failure    | Page renders what it has; failed panel shows inline ErrorState with retry                        |
| Provider outage    | Quotes show last cached value + amber "Stale · as of 14:02 ET" chip                              |
| Pipeline degraded  | Status banner; order rows show last-synced context — never fake "live"                           |
| Market closed      | Prices labeled "At close"                                                                        |
| Network loss       | Offline banner + mutation disabling (**post-MVP**); failed mutations surface inline errors today |
| Empty              | Teaching empty states                                                                            |
| Auth required      | Redirect to signin preserving return path                                                        |
| Live preview       | Live's own empty states; paper data never renders under `data-mode="live"`                       |

**Hard rule:** a rendered price without its timestamp/freshness state is a review-blocking bug.
