# Domain model

> **Purpose:** the ubiquitous language — every term used in code, docs, and specs, defined once.
> **Audience:** everyone. **Belongs here:** glossary + entity relationships. **Lives elsewhere:** schema (DATA_MODEL.md), behavior (EXECUTION.md).

## Glossary

- **User** — an authenticated identity.
- **Account** — a Arthosrot trading account owned by a user; `mode` PAPER; lifecycle PROVISIONING → ACTIVE → ARCHIVED (or PROVISIONING_FAILED). One open (PROVISIONING or ACTIVE) account per user; resets archive and re-provision.
- **Broker account** — the external venue account mapped 1:1 to a Arthosrot account (`broker_accounts`), carrying reconciliation health fields.
- **Instrument** — a tradable US equity (symbol, name, exchange, status).
- **Quote** — `{symbol, bid, bidSize, ask, askSize, last, ts, source, previousClose}` — always timestamped; never "current" without qualification. Market status (OPEN/CLOSED/PRE/POST) is a separate provider call.
- **Order** — an instruction to trade: side (BUY/SELL), type (MARKET/LIMIT), qty (whole shares), limit price, time-in-force (DAY), state (EXECUTION.md), idempotency key, venue ids.
- **Canonical BrokerEvent** — vendor-neutral execution event; the only input that mutates execution-derived financial state.
- **Fill** — an execution fact imported from a canonical event: qty, price, fee, venue `execution_id`, timestamp. Immutable. Orders may have multiple fills.
- **Position** — current holding per (account, instrument): qty + cost-basis total; avg cost = basis/qty.
- **Sellable quantity** — position qty − Σ remaining qty of open SELL orders.
- **Reservation** — buying power or shares earmarked by an open order's remaining quantity. Buy reservations are stored on the order (`orders.reserved_cash`, because a market buy's reserve depends on its placement-time reference price) and recomputed on each fill; share reservations are derived from open sells.
- **Buying power** — cash projection − Σ active buy reservations.
- **Ledger entry** — append-only record of a cash movement with type, signed 2dp amount, and cause reference. The ledger is the authoritative Arthosrot financial history.
- **Cash projection** — `accounts.cash_balance`, a cached value asserted equal to Σ(ledger entries).
- **Cash transfer** — a paper deposit or withdrawal request (ADR-015): PENDING → SETTLED | FAILED | CANCELED. It changes cash only through the ledger entry posted when the venue reports it settled; a PENDING withdrawal is a **hold** that reduces buying power and withdrawable.
- **Withdrawable** — cash − open BUY reservations − pending withdrawals, floored at zero: the cash not actively being used.
- **Realized P&L** — locked in by sells: proceeds − fees − allocated cost basis (average-cost method).
- **Unrealized P&L** — (market − avg cost) × qty, always carrying the quote `asOf`.
- **Reconciliation status** — per broker account: HEALTHY / STALE / RECONCILING / DRIFT_DETECTED / ERROR.
- **Day change** — `last − previousClose` (and %) against the prior session's IEX close. Display data only.
- **Top 100 snapshot** — a dated ranking of US companies by market value (SEC shares outstanding × IEX price), written by the scheduled Top 100 job; readers take the newest. Display data only.
- **Key stats** — market cap, P/E (TTM, or FY when labelled) and 52-week range on the instrument page, derived from `company_fundamentals` + live market data. Display data only.
- **Scheduled job** — a worker task with its own interval and lease (`job_runs`), run when due on startup or on the hourly tick.
- **Display freshness vs execution eligibility** — how old displayed market data is (UI concern) vs whether an order may execute (the venue's authority in deployed mode; strict staleness rules apply only in the deterministic broker, which is its own execution authority).

## Entity relationships

```
User 1─* Account (one open) 1─1 BrokerAccount
Account 1─* Order 1─* Fill
Order  1─* OrderEvent (canonical audit)
Account 1─* LedgerEntry (append-only)
Account 1─* CashTransfer 0..1─1 LedgerEntry (posted at SETTLED)
Account 1─* Position *─1 Instrument
User 1─1 Watchlist 1─* WatchlistItem *─1 Instrument
MarketCapSnapshot 1─* MarketCapEntry          (display data; keyed by symbol/cik, no FK to Instrument)
CompanyFundamentals (one row per symbol)       (display data; no FK to Instrument)
```
