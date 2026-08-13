# Requirements

> **Purpose:** numbered functional and non-functional requirements — the reference for acceptance criteria in specs.
> **Audience:** implementers and reviewers. **Belongs here:** FR/NFR statements. **Lives elsewhere:** how they're met (architecture/), per-feature detail (specs/).

## Assumptions

1. US-listed equities; whole shares; long-only, cash-account semantics **enforced by Ledgerline pre-trade checks** (the sandbox opens limited-purpose margin accounts; our stricter rules mean margin/short orders are never submitted).
2. One ACTIVE paper account per user; archived accounts accumulate on reset.
3. Regular session only (`extended_hours=false`); venue queuing behavior applies to after-hours submissions and is surfaced, not re-implemented.
4. Alpaca Broker API **Sandbox** is the deployed venue (free, self-serve, real prices/market hours, simulated execution). Its dev/test framing is a documented risk with exit paths (LIMITATIONS.md, INTEGRATIONS.md).
5. **Synthetic KYC only** — no real user PII is ever sent to the sandbox.
6. Low usage (tens of users); free tiers suffice.

## Functional requirements

- **FR-1 Identity:** email+password signup (zxcvbn ≥ 3), signin/signout, persistent revocable sessions.
- **FR-2 Account:** signup triggers async provisioning: local account (PROVISIONING) → sandbox brokerage account (synthetic KYC) → simulated funding to STARTING_CASH → ACTIVE + DEPOSIT ledger entry. Reset = cancel eligible open orders → archive account (history immutable) → provision fresh local + broker account.
- **FR-3 Instruments:** search by symbol/name; detail page with name, exchange, quote, chart.
- **FR-4 Quotes:** bid/bidSize/ask/askSize/last + timestamp + market status + feed label. Never render a price without freshness context.
- **FR-5 Charts:** 1D/1W/1M/3M/1Y/5Y candles; explicit missing-data states.
- **FR-6 Watchlist:** add/remove/reorder; quote + day change per row.
- **FR-7 Orders:** submit market/limit with idempotency key; local pre-trade validation (buying power incl. reservations, sellable qty, whole shares, price precision) → broker submission → asynchronous lifecycle (architecture/EXECUTION.md); cancel with CANCEL_PENDING semantics; list open/history; detail shows fills + canonical event timeline.
- **FR-8 Execution:** broker-managed. Fills (incl. partial/multi-fill) arrive as canonical events via the worker; each fill atomically updates order, fills, ledger, position, cash projection. DAY limit orders expire per venue behavior.
- **FR-9 Realtime UX:** submitted orders appear immediately as Pending and advance automatically; no manual refresh needed to learn about a fill.
- **FR-10 Portfolio:** positions (qty, sellable, avg cost, market value, unrealized P&L, weight), summary, realized P&L.
- **FR-11 Ledger:** every cash movement is an append-only entry linked to its canonical cause; activity page renders it.
- **FR-12 Reconciliation:** on worker start, SSE reconnect, and schedule: reconcile open orders/fills/positions/cash vs broker; import missed events exactly-once; log drift with a reconciliation status.
- **FR-13 Modes:** accounts are explicitly PAPER; UI labels simulation persistently.

## Non-functional requirements

- **NFR-1 Correctness:** every invariant in architecture/FINANCIAL_INVARIANTS.md enforced + tested; no float arithmetic on financial values; the same external event never produces financial effects twice.
- **NFR-2 Execution truth:** broker events are the only input mutating execution-derived financial state; fills are immutable historical facts.
- **NFR-3 Security:** per architecture/SECURITY.md; per-user isolation; broker credentials server/worker-side only.
- **NFR-4 Availability:** best-effort free tier; near-real-time events while the worker is awake; worst-case bounded by reconciliation cadence; UI distinguishes live vs stale honestly.
- **NFR-5 Performance:** p75 page load < 3s cold / < 1.5s warm; order-status UI latency ≤ ~3s after DB write; API p95 < 500ms warm; cold starts absorbed by loading states — **no artificial anti-sleep traffic**.
- **NFR-6 Accessibility:** WCAG 2.2 AA (design/ACCESSIBILITY.md).
- **NFR-7 Portability:** full platform runs offline (`deterministic` + `fixture` providers); CI never touches live Alpaca.
- **NFR-8 Auditability:** canonical events + fills + ledger reconstruct account state at any time.
