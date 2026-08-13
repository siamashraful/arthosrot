# ADR-008 — Concurrency & idempotency: row locks + a four-link idempotency chain + replayable ingestion

**Status:** accepted (2026-08)

**Context:** Simultaneous orders, duplicate submissions, duplicate/out-of-order broker events, and stream gaps must never produce duplicate financial effects or negative positions — at small scale, without distributed machinery.

**Decision:**

1. **Concurrency:** Postgres row locks at READ COMMITTED. Placement: `FOR UPDATE` on the account → compute buying power/sellable from locked state (reservations included) → insert PENDING_SUBMISSION → commit → submit outside the lock. Event application: lock account → order → position (fixed lock order), apply transition + fill + ledger + projection in one transaction. No serializable isolation, no queues.
2. **Idempotency chain:** (i) client `idempotencyKey` + `UNIQUE(account_id, idempotency_key)`, insert-first with conflict-replay; (ii) `client_order_id` = order UUID at the venue (409 → fetch existing); (iii) unique `external_event_id`/`execution_id` make event application replay-safe; (iv) cancel naturally idempotent.
3. **Ingestion:** single SSE consumer, serial per account; resumable via stored ULID cursor; REST reconciliation shares the same idempotent apply path, so stream/reconciliation overlap is harmless.

**Rationale:** The database is already the serialization point; row locks give correctness with ~zero operational surface. The chain means a retry or replay at _any_ link — browser, API, venue, stream, reconciliation — collapses to one financial effect (invariants 9/10/15).

**Consequences:** the concurrency scenario suite (double-submit, competing buys/sells, cancel-vs-fill, SSE+REST duplicate, fill-before-ack) is a permanent CI fixture; "simplifying" the locking is forbidden by CLAUDE.md.

**Revisit when:** sustained write contention appears (then: per-account advisory locks or a queue — documented migration, not a default).
