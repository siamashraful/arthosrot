# MVP scope

> **Purpose:** the contract for what MVP includes, excludes, and which decisions remain open.
> **Audience:** anyone planning or reviewing work. **Belongs here:** scope, non-goals, open decisions log. **Lives elsewhere:** detailed requirements (REQUIREMENTS.md), phases (ROADMAP.md).

## In scope

- Auth: email/password, revocable sessions (Better Auth).
- Paper account: $100,000 starting cash (env-configurable), provisioned as an **isolated external sandbox brokerage account** per user; account reset via archive-and-recreate (history preserved).
- Instruments: search, detail page, bid/ask/last quotes with freshness labeling, historical candles + chart (1D/1W/1M/3M/1Y/5Y).
- One watchlist per user.
- **Market orders (buy/sell)** and **limit orders (buy/sell, DAY)** with a real asynchronous lifecycle: broker acknowledgement, resting, fills, **partial fills handled completely**, cancellation (incl. cancel-vs-fill race), venue-managed DAY expiration.
- Buying-power and share **reservations** for open orders.
- Order list/detail/history with canonical event timeline; **UI order status updates without manual refresh** (adaptive polling).
- Positions (qty, sellable qty, avg cost, market value, unrealized P&L, weight), realized P&L, portfolio summary (equity, cash, day change, buying power).
- Immutable ledger / activity feed.
- Reconciliation engine + operational health statuses.
- Account settings: display name, theme.

## Explicit non-goals (MVP)

Real-money trading · options, margin, shorting, crypto, forex, futures · fractional shares · GTC/stop/stop-limit/trailing/IOC/FOK (cheap fast-follows — venue-native; excluded from MVP scope, not from the Broker contract) · extended-hours trading (`extendedHours` exists in the contract; disabled) · dividends/corporate actions · algorithmic/social trading · AI advice · advanced charting/indicators · tax reporting · native apps · notifications/email · admin console · multiple watchlists.

## Fast-follow queue (post-MVP, ordered)

1. **GTC** (high priority — mostly a `tif` passthrough + UI).
2. Stop / stop-limit orders.
3. Extended-hours limit orders.
4. Trailing stop.
5. Multiple watchlists; fractional shares; SSE push to browser.

## Open decisions

| #   | Decision                                                                                | Status                                  |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Product/repo name ("Arthosrot" is a placeholder)                                        | Open                                    |
| 2   | Password reset at MVP (needs email — Resend free tier) vs deferred                      | Open — decide before auth phase ends    |
| 3   | Vercel Hobby non-commercial ToS comfort (Cloudflare exit documented)                    | Open                                    |
| 4   | Public vs private repo (public recommended: free CI, portfolio value)                   | Open                                    |
| 5   | Alpaca Broker Dashboard sandbox signup (user action: broker-app.alpaca.markets/sign-up) | Open — required before deployment phase |
