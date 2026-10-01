# UX patterns & screen specs

> **Purpose:** wireframe-level intent for each major surface + the standing state catalog every page must implement.
> **Audience:** UI implementers before building any screen. **Belongs here:** screen behavior + states. **Lives elsewhere:** visual system (DESIGN_SYSTEM.md), the as-built class mapping (DESIGN.md), breakpoints (RESPONSIVE_BEHAVIOR.md).

## Information architecture

Five sections — Dashboard `/` · Markets `/markets`, `/markets/s/[slug]`, `/i/[symbol]` · Portfolio `/portfolio` · Orders `/orders` · Activity `/activity`. Account/settings via the sidebar (desktop) and the top-bar icon buttons (phone). Global: omnisearch (Cmd/Ctrl-K — **post-MVP**; phones reach search via the top-bar icon), the persistent **mode ribbon** ("Practice — simulated money" / "Live preview — real trading isn't available yet"), market status + data freshness in the shell, and the **status banner** — the system's warning Banner — when the event pipeline degrades ("Order updates may be delayed — last sync 14:02 ET", driven by `/api/v1/system/status`).

## Screens

- **Dashboard:** the **hero card** = portfolio value (`.ar-hero__value`, display 40/700) + day change (signed, arrow, `--hero-gain`/`--hero-loss`, sr sign text) + the net-worth curve with period pills; below it the tile row — **Stocks** as the cobalt bloom tile, **Cash** as the paper-and-tint tile with the butter icon chip — and insight cards for day change and open orders (value in `--text`, never a bloom colour); then positions (top 5 + link), watchlist (each row links to the instrument and carries a remove control), open orders, recent activity as list rows. Empty state (`.ar-empty`) teaches: "Search a symbol to place your first paper trade" with inline search. Under `data-mode="live"` the hero and tiles render live's own $0.00 empty states on the black hero.
- **Markets (browse, then search):** the search field on top; with an empty query the screen is **Browse** — a full-width **Top 100** card (largest US companies by market value, "updated {date}", five stacked logos) then the 11 sector cards (2 columns on phones, 3 from 768px: Stocks chip with the sector's icon, name, "N companies", three stacked logos). Typing replaces Browse with search results; clearing brings it back. A card is one link whose visible text is its accessible name.
- **Browse list** (`/markets/s/[slug]`): app bar with back chevron and the list name; an intro card (icon chip, one plain-language sentence, "N companies" or — for the Top 100 — "Ranked by market value · updated {date}", and one freshness chip for the list's prices); then rows: rank (Top 100 only — the order carries information), logo, symbol, name, last price, **day change** (sign + arrow + sr-text "today"/"last session"); "—" when a symbol has no quote. 25 rows, then "Show more". Unknown list → "This list doesn't exist." with a way back.
- **Instrument page:** app bar with back chevron; SYMBOL as a sky tag · `SymbolLogo` chip · name · **Bid / Ask / Last** with sizes · **day change vs the previous close** (sign, arrow, sr-text) · freshness chip ("IEX · 12s ago" / "Market closed · at close"); chart with period pills (1D–5Y; 1D is the most recent session, so it still draws on weekends and before the open) that scrubs to a price, its change since the range opened and the bar's date/time; "Your position" strip if held (account data visually separated from market data; never shown in live preview); a watchlist toggle (Add to / Remove from watchlist, `aria-pressed`); docked ticket or pinned Trade bar — shown once the account is known (skeleton while loading, an "Open your account to trade" card when there is no active account). The ticket pre-checks orders certain to be rejected — selling shares not held, a buy estimate above buying power — before review; the server stays the authority. Execution price on order detail is visibly distinct from displayed quote ("Filled at 200.13 · quoted 200.10 at submit") — never a fabricated explanation for the difference.
- **Trading ticket:** segmented **Buy/Sell** (labelled, neutral) → type (Market/Limit) → qty stepper/input → limit price (limit only) → live estimate rows (`.ar-ticket-row`: est. value using ask for buys / bid for sells, est. fees, buying power remaining or sellable shares) → Review → `.review-summary` ("Buy 10 AAPL · Market · est. $2,000.00 · Practice account — simulated money") → single primary pill Confirm. Disabled states always carry a reason. On submit, the ticket closes into an order chip showing **Pending** (warning tag, icon + word) with a `FillProgress` bar that advances live — never optimistic FILLED. Success is the quiet `.ar-success-mark` and the fill summary; no flourish.
- **Orders:** filter chips Open / History; rows: side, symbol, `FillProgress` + filled/total qty, type + limit, `OrderStatusBadge` as a tag with icon + word (Pending, Open, Partially filled, Filled, Cancelling, Cancelled, Rejected, Expired, Failed to submit), time; inline cancel (per-row pending state; a refused cancel shows the venue's reason beside the row). Detail: a **Cancel order** action while the venue still accepts one, canonical event timeline (source-labelled: broker / local / inferred / reconciliation) + fills + venue reject reason when present.
- **Portfolio:** hero card summary; positions table (symbol, qty, avg cost, price, market value, day change, unrealized P&L $ and %, weight) on wide screens, list rows on phones; realized P&L section; allocation as a single horizontal stacked bar (no pie; segments in bloom hues by category, values in text beside every segment).
- **Activity:** list rows grouped by day; each entry: an activity icon chip (`.ar-chipicon--{gain,loss,cash,neutral}`), description ("Bought 10 AAPL @ 200.00"), signed amount, link to the causing order; access to archived-account history after resets. History pages 50 entries at a time ("Show older activity") on a server keyset cursor over `(created_at, id)` — entries posted in one transaction share a timestamp, so a time-only cursor would skip them.
- **Auth:** minimal centred `.auth-card`; paper-trading disclosure at signup.
- **Settings:** setting rows; display name, theme, trading-mode switch (segmented; confirm sheet names the mode in words; neutral copy, no flourish), account reset (type-to-confirm; explains archival).

## Motion patterns

| Pattern          | Behavior                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet open/close | Native `<dialog>` — `sheet-up` (16px rise) over `--duration-base` 250ms `--ease-out-expo`; `::backdrop` is the scrim. Close is instant.             |
| Press feedback   | Buttons, tiles and nav rows scale to 0.98 while pressed (`--duration-fast`); rows and secondary buttons take the `--pressed` overlay. Nothing else. |
| Selection        | Chip, segment and toggle changes over `--duration-fast` 150ms.                                                                                      |
| Status change    | `OrderStatusBadge` remounts on `key={state}` with `pulse-in` — a state either is or is not; no crossfade between states.                            |
| Fill bar         | Width transitions over `--duration-base`; the only motion attached to order data, and it moves toward a fact, never a verdict.                      |
| Skeleton         | Static `--divider` blocks mirroring the final layout (no shimmer).                                                                                  |
| Forbidden        | Entrance animation on data (stagger, rise-in) · anything that reacts to a fill, a gain, a loss, or the paper→live switch with celebration.          |
| Reduced motion   | Every transition and keyframe collapses to one near-instant run.                                                                                    |

## Status banner

The system's **warning Banner** (`.status-banner`, `role="status"`) directly under the mode ribbon; appears when `/api/v1/system/status` reports a degraded pipeline and stays until it clears. Copy names the condition and the last sync time. It never auto-dismisses and never animates; order rows show their last-synced context while it is visible.

## Standing state catalog (every page)

| State              | Behavior                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Initial load       | Route-level skeletons (`.ar-skel*`) shaped like the content — no blank screens, no layout shift  |
| Background refresh | Quiet stale-while-revalidate; no motion on the updated value                                     |
| Partial failure    | Page renders what it has; failed panel shows an inline loss Banner with retry                    |
| Provider outage    | Quotes show last cached value + a warning tag "Stale · as of 14:02 ET"                           |
| Pipeline degraded  | Status banner; order rows show last-synced context — never fake "live"                           |
| Market closed      | Prices labelled "At close"                                                                       |
| Network loss       | Offline banner + mutation disabling (**post-MVP**); failed mutations surface inline errors today |
| Empty              | Teaching empty states (`.ar-empty`: heading, one sentence, one primary action)                   |
| Auth required      | Redirect to signin preserving return path                                                        |
| Live preview       | Live's own empty states; paper data never renders under `data-mode="live"`                       |

**Hard rule:** a rendered price without its timestamp/freshness state is a review-blocking bug.
