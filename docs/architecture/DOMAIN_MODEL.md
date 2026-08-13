# Domain model

> **Purpose:** the ubiquitous language — every term used in code, docs, and specs, defined once.
> **Audience:** everyone. **Belongs here:** glossary + entity relationships. **Lives elsewhere:** schema (DATA_MODEL.md), behavior (EXECUTION.md).

## Glossary

- **User** — an authenticated identity.
- **Account** — a Ledgerline trading account owned by a user; `mode` PAPER; lifecycle PROVISIONING → ACTIVE → ARCHIVED (or PROVISIONING_FAILED). One ACTIVE per user; resets archive and re-provision.
- **Broker account** — the external venue account mapped 1:1 to a Ledgerline account (`broker_accounts`), carrying reconciliation health fields.
- **Instrument** — a tradable US equity (symbol, name, exchange, status).
- **Quote** — `{bid, bidSize, ask, askSize, last, ts, source, marketStatus}` — always timestamped; never "current" without qualification.
- **Order** — an instruction to trade: side (BUY/SELL), type (MARKET/LIMIT), qty (whole shares), limit price, time-in-force (DAY), state (EXECUTION.md), idempotency key, venue ids.
- **Canonical BrokerEvent** — vendor-neutral execution event; the only input that mutates execution-derived financial state.
- **Fill** — an execution fact imported from a canonical event: qty, price, fee, venue `execution_id`, timestamp. Immutable. Orders may have multiple fills.
- **Position** — current holding per (account, instrument): qty + cost-basis total; avg cost = basis/qty.
- **Sellable quantity** — position qty − Σ remaining qty of open SELL orders.
- **Reservation** — buying power or shares earmarked by an open order's remaining quantity (derived, never stored).
- **Buying power** — cash projection − Σ active buy reservations.
- **Ledger entry** — append-only record of a cash movement with type, signed 2dp amount, and cause reference. The ledger is the authoritative Ledgerline financial history.
- **Cash projection** — `accounts.cash_balance`, a cached value asserted equal to Σ(ledger entries).
- **Realized P&L** — locked in by sells: proceeds − fees − allocated cost basis (average-cost method).
- **Unrealized P&L** — (market − avg cost) × qty, always carrying the quote `asOf`.
- **Reconciliation status** — per broker account: HEALTHY / STALE / RECONCILING / DRIFT_DETECTED / ERROR.
- **Display freshness vs execution eligibility** — how old displayed market data is (UI concern) vs whether an order may execute (the venue's authority in deployed mode; strict staleness rules apply only in the deterministic broker, which is its own execution authority).

## Entity relationships

```
User 1─* Account (one ACTIVE) 1─1 BrokerAccount
Account 1─* Order 1─* Fill
Order  1─* OrderEvent (canonical audit)
Account 1─* LedgerEntry (append-only)
Account 1─* Position *─1 Instrument
User 1─1 Watchlist 1─* WatchlistItem *─1 Instrument
```
