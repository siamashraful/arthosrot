# Roadmap

> **Purpose:** the single source of truth for build phases, their status, and what to work on next.
> **Audience:** everyone, every session. **Belongs here:** phase list + status. **Lives elsewhere:** feature detail (specs/), decisions (architecture/adr/).

Review gates: **hard gate** = Fable (architecture-model) review required before the next phase begins.

| #   | Phase                                       | Status  | Exit criteria                                                                | Gate                           |
| --- | ------------------------------------------- | ------- | ---------------------------------------------------------------------------- | ------------------------------ |
| 1   | Repository + documentation                  | ✅ done | Quality gates green on scaffold; docs/ + ADRs + README + CLAUDE.md committed | Docs review                    |
| 2   | Database + authentication                   | ✅ done | Migrations-from-zero in CI; auth E2E; cross-user 404s                        | Security review                |
| 3   | Money + ledger + accounts                   | ✅ done | Invariants 6/8/14; money property tests                                      | **Hard gate (arithmetic)**     |
| 4   | Instruments + market data                   | ⬜ next | Provider contract suite (fixture + recorded Alpaca); offline boot            | —                              |
| 5   | Order domain + state machine                | ⬜      | Exhaustive transition tests; invariants 1/2/4/5/9/11                         | **Hard gate**                  |
| 6   | Broker interface + DeterministicPaperBroker | ⬜      | Deterministic broker passes full compliance suite                            | Contract review                |
| 7   | Event ingestion + ExecutionService          | ⬜      | Golden market-order scenario; invariants 3/7/10/13/15                        | **Adversarial hard gate**      |
| 8   | External adapter + worker                   | ⬜      | Compliance suite vs recorded fixtures; manual sandbox smoke                  | Translation/idempotency review |
| 9   | Reconciliation engine                       | ⬜      | Reconnect/missed-event/out-of-order scenarios green                          | **Hard gate**                  |
| 10  | Positions/P&L + remaining API               | ⬜      | Invariants 12/14; full API surface                                           | P&L review                     |
| 11  | Market-order vertical slice (API)           | ⬜      | Slice green vs deterministic (CI) + sandbox (manual)                         | —                              |
| 12  | Limit-order vertical slice (API)            | ⬜      | Rest/fill/cancel/partial/expire green both venues                            | Verification                   |
| 13  | Design system                               | ⬜      | Token contrast CI; component states page; axe clean                          | Design direction               |
| 14  | Shell + realtime updates                    | ⬜      | Responsive shell E2E; orders auto-update                                     | —                              |
| 15  | Trading UI                                  | ⬜      | Golden-path E2E: UI reaches Filled without refresh                           | UX critique                    |
| 16  | Portfolio/activity UI + dashboard           | ⬜      | Full-slice E2E green                                                         | —                              |
| 17  | Hardening                                   | ⬜      | Security + a11y checklists green                                             | **Security gate**              |
| 18  | Free-tier deployment                        | ⬜      | Public URL at $0; both slices work against sandbox                           | Verification                   |

## Vertical slices (standing acceptance)

- **A — Market order:** BUY 10 AAPL MARKET → broker ack → fill event → canonical apply (once) → fill + TRADE −2,000.00 + cash 8,000.00 + position 10 @ 200.00 → portfolio API correct → idempotent replay returns same order → UI advances to Filled without refresh. Runs vs deterministic (CI), sandbox (smoke), later Playwright.
- **B — Limit order:** (i) non-marketable BUY LIMIT rests with reservation, fills when crossed, reservation released; (ii) place → cancel → CANCELLED, reservation released; (iii) partial fill reduces remaining + reservation correctly; (iv) DAY expiry releases reservation. (i)–(iv) vs deterministic in CI; (i)–(ii) also in external smoke.

Fast-follow queue after MVP: see MVP.md.
