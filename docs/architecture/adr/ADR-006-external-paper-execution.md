# ADR-006 — External paper execution: Alpaca Broker API Sandbox + DeterministicPaperBroker

**Status:** accepted (2026-08)

**Context:** The objective is the most realistic paper-trading experience possible at $0/month. Requirements: real market **and limit** orders, per-user isolated accounts, asynchronous lifecycle, partial-fill safety, event reconciliation, no manual refresh, deterministic offline testing, broker portability.

**Options considered:**

- **A. Fully self-built paper engine** — fails realism; requires our own continuous matcher (the rejected timer-matching architecture); every fill is invented.
- **B. Alpaca Trading API paper environment** — real venue simulation, but **one paper account per Alpaca login**: users would share buying power/positions or each need their own Alpaca signup. Fails multi-user isolation. Rejected.
- **C. Alpaca Broker API Sandbox alone** — free, self-serve, isolated brokerage accounts created via API (synthetic KYC, simulated funding), venue-managed market/limit/partial-fill/DAY-expiry execution against real prices/hours, replayable SSE events with ULID cursors and per-fill execution_ids, client_order_id dedup (409). But alone it fails deterministic offline testing.
- **D. Hybrid: C for deployment + a DeterministicPaperBroker for tests/CI/local/offline**, both behind the ADR-005 contract and compliance suite.

**Decision:** **D.**

**Rationale:** D satisfies every mandatory requirement; the deterministic broker was needed for testing under any option, so its cost is not marginal to this decision. Verified facts (research 2026-08): sandbox signup is free/self-serve with "unlimited sandbox testing"; `/v2/events/trades` SSE replays via `since_ulid`; duplicate `client_order_id` → 409; rate limit ~1,000 req/min.

**The honest limitation:** the sandbox is contractually a development/testing environment — indefinite public use is a gray zone and sandbox data isn't guaranteed durable. Absorbed deliberately: Arthosrot's ledger + canonical events are the durable record (sandbox state is disposable); the deterministic broker is a same-contract fallback venue; graduation (production Broker API relationship or another broker) is an adapter swap, not a rearchitecture.

**Consequences:** requires the worker + reconciliation machinery (ADR-010, EXECUTION.md); synthetic-KYC rule (SECURITY.md); external tests isolated from CI.

**Revisit when:** Alpaca changes sandbox policy; the project needs production-grade execution guarantees; or a second broker adapter is added.
