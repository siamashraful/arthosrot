# UX patterns & screen specs

> **Purpose:** wireframe-level intent for each major surface + the standing state catalog every page must implement.
> **Audience:** UI implementers before building any screen. **Belongs here:** screen behavior + states. **Lives elsewhere:** visual system (DESIGN_SYSTEM.md), breakpoints (RESPONSIVE_BEHAVIOR.md).

## Information architecture

Five sections — Dashboard `/` · Markets `/markets`, `/i/[symbol]` · Portfolio `/portfolio` · Orders `/orders` · Activity `/activity`. Account/settings via the sidebar (desktop) and the compact top-bar icons (mobile). Global: omnisearch (Cmd/Ctrl-K — **post-MVP**; mobile reaches search via the top-bar icon), persistent **PAPER badge**, market status + data freshness in the shell, and a quiet system-status banner when the event pipeline degrades ("Order updates may be delayed — last sync 14:02 ET", driven by `/api/v1/system/status`).

## Screens

- **Dashboard:** top strip = portfolio value (32px) + day change (signed, colored) + cash + buying power as one quiet stats row (no hero-metric cards); then positions (top 5 + link), watchlist, open orders, recent activity. Empty state teaches: "Search a symbol to place your first paper trade" with inline search.
- **Instrument page:** header: SYMBOL · name · **Bid / Ask / Last** with sizes · signed change · freshness chip ("IEX · 12s ago" / "Market closed · at close"); chart with range tabs (1D–5Y); "Your position" strip if held (account data visually separated from market data); Trade ticket/button. Execution price on order detail is visibly distinct from displayed quote ("Filled at 200.13 · quoted 200.10 at submit") — never a fabricated explanation for the difference.
- **Trading ticket:** segmented **Buy/Sell** (labeled, brand-neutral) → type (Market/Limit) → qty stepper/input → limit price (limit only) → live estimate block (est. value using ask for buys / bid for sells, est. fees, buying power remaining or sellable shares) → Review → confirmation summary ("Buy 10 AAPL · Market · est. $2,000.00 · Paper account") → single accent Confirm. Disabled states always carry a reason. On submit, the ticket closes into an order chip showing **Pending** that advances live — never optimistic FILLED.
- **Orders:** tabs Open / History; rows: side, symbol, filled/total qty, type + limit, `OrderStatusBadge` (Pending, Open, Partially filled, Filled, Cancelling, Cancelled, Rejected, Expired, Failed to submit), time; inline cancel with confirm popover. Detail: canonical event timeline (source-labeled: broker / local / inferred / reconciliation) + fills + venue reject reason when present.
- **Portfolio:** summary header; positions table (symbol, qty, avg cost, price, market value, day change, unrealized P&L $ and %, weight); realized P&L section; allocation as a single horizontal stacked bar (no pie).
- **Activity:** ledger list grouped by day; each entry: type icon, description ("Bought 10 AAPL @ 200.00"), signed amount, links to the causing order; access to archived-account history after resets.
- **Auth:** minimal centered card; paper-trading disclosure at signup.
- **Settings:** display name, theme, account reset (type-to-confirm; explains archival).

## Standing state catalog (every page)

| State              | Behavior                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Initial load       | Route-level skeletons mirroring final layout — no blank screens, no layout shift                 |
| Background refresh | Quiet stale-while-revalidate                                                                     |
| Partial failure    | Page renders what it has; failed panel shows inline ErrorState with retry                        |
| Provider outage    | Quotes show last cached value + amber "Stale · as of 14:02 ET" chip                              |
| Pipeline degraded  | System-status banner; order rows show last-synced context — never fake "live"                    |
| Market closed      | Prices labeled "At close"                                                                        |
| Network loss       | Offline banner + mutation disabling (**post-MVP**); failed mutations surface inline errors today |
| Empty              | Teaching empty states                                                                            |
| Auth required      | Redirect to signin preserving return path                                                        |

**Hard rule:** a rendered price without its timestamp/freshness state is a review-blocking bug.
