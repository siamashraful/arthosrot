# ADR-005 — Broker abstraction: canonical events, authority split, unknown-status policy

**Status:** accepted (2026-08)

**Context:** Trading logic must never couple to one broker; execution is asynchronous; vendors deliver duplicate, out-of-order, and occasionally novel statuses.

**Decision:**

1. One `Broker` port (provision/submit/cancel/getOrder/listOpenOrders/getAccountSnapshot/subscribe) — asynchronous-shaped; fills arrive as events, never as submit() return values.
2. **Canonical BrokerEvents** (ACKNOWLEDGED/ACCEPTED/PARTIALLY_FILLED/FILLED/CANCEL_PENDING/CANCELLED/REJECTED/EXPIRED/REPLACED-reserved/UNKNOWN_VENDOR_STATUS) with stable external ids; adapters translate vendor payloads; vendor types never leave `infra/brokers/<vendor>`.
3. **Authority split:** the broker owns execution facts (acceptance, fills, prices, cancellation, expiration); Ledgerline owns identity, mapping, canonical event history, ledger, projections, presentation. Disagreement → import missing events idempotently; never overwrite history from snapshots.
4. **Unknown vendor status:** persist as UNKNOWN event, no state transition, flag `needs_attention`, reconciliation ERROR, error log. Safe by default.
5. Every implementation passes the same **Broker compliance suite**; the state machine lives in the domain (`applyTransition`), not in DB triggers.

**Rationale:** This is the seam that makes external paper execution (ADR-006), deterministic testing, and future live brokers the same shape. The event-sourced boundary plus unique external ids is what makes replay/reconciliation exactly-once.

**Consequences:** slightly more ceremony for the deterministic broker (it must emit realistic event sequences) — which is exactly what makes tests meaningful.

**Revisit when:** adding a live adapter (extends kinds + mandatory SECURITY.md controls) or an order-replacement feature (activates ORDER_REPLACED).
