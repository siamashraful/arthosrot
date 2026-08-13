# System architecture

> **Purpose:** the system-level map — deployables, data flow, authority boundaries, directory responsibilities.
> **Audience:** every developer, first architecture read. **Belongs here:** topology, flows, authority split. **Lives elsewhere:** execution detail (EXECUTION.md), schema (DATA_MODEL.md), boundaries (MODULE_BOUNDARIES.md), decisions (adr/).

## Topology

A modular monolith in one TypeScript repository producing **two deployables from the same codebase**:

```
Browser (React) ── HTTPS ──▶ Next.js on Vercel
   │  pages + /api/v1/*  (adaptive polling for order/portfolio updates)
   │  server/container.ts → core services → infra/db ──▶ Neon Postgres (Ledgerline system of record)
   │                                    └─ infra/market-data ─▶ Alpaca IEX (cached)
   │  order placement: validate + reserve locally → AlpacaPaperBroker.submit (REST)
   │
Worker on Render (same codebase)
   ├─ SSE subscribe /v2/events/trades (since_ulid = stored cursor) ─▶ Alpaca Broker Sandbox
   ├─ adapter translates vendor events → canonical BrokerEvents
   ├─ ExecutionService applies each event in one DB transaction
   ├─ Reconciliation engine (startup / reconnect / schedule / on-demand)
   └─ HTTP: /healthz, /reconcile (CRON_SECRET)

GitHub Actions (market hours, ~10 min) ──▶ POST worker /reconcile   # genuine reconciliation; also wakes a slept worker
```

No queues, Redis, Kubernetes, or event bus. All Ledgerline state lives in Postgres; the broker's SSE stream is **replayable via ULID cursors**, so worker restarts and free-tier sleeps are safe — missed events are recovered exactly-once. Two deployables is the minimum topology satisfying "broker-pushed events, near-real-time, $0": serverless can't hold an outbound SSE subscription, and a slow scheduler as the primary matching/notification path is rejected by design (ADR-010).

## Authority split (normative)

| Fact                                                                          | Authority                                                    | Ledgerline's role                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Order acceptance/rejection, fills (qty/price/time), cancellation, expiration  | **Broker**                                                   | Import via canonical events; immutable once recorded                       |
| Order execution status                                                        | Broker                                                       | Local state = projection of canonical events; converges via reconciliation |
| Positions, cash, buying power                                                 | **Ledgerline projections** derived from its own ledger/fills | Broker snapshots are a _reconciliation reference_, never blindly copied    |
| P&L, ledger, canonical event history, identity, account mapping, presentation | **Ledgerline**                                               | Sole owner                                                                 |

Disagreement handling: broker execution facts win; Ledgerline discovers missing/extra events, applies them idempotently, logs the discrepancy — it never silently overwrites its history from a snapshot.

## Directory responsibilities

| Path                                                    | Responsibility                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/core/money`                                        | Money/Px/Qty value objects, rounding rules                                                                 |
| `src/core/accounts`                                     | Account lifecycle (PROVISIONING/ACTIVE/ARCHIVED), reset orchestration rules                                |
| `src/core/instruments`                                  | Instrument entity, symbol normalization                                                                    |
| `src/core/market-data`                                  | MarketDataProvider port, display-freshness rules                                                           |
| `src/core/orders`                                       | Order entity, state machine, validation taxonomy, reservation formulas                                     |
| `src/core/execution`                                    | ExecutionService, Broker port, canonical BrokerEvent model, event application                              |
| `src/core/brokers/deterministic`                        | DeterministicPaperBroker (no vendor deps)                                                                  |
| `src/core/reconciliation`                               | Reconciliation engine (pure logic; ports injected)                                                         |
| `src/core/ledger`                                       | Entry types, posting rules, cash projection + reconcile                                                    |
| `src/core/portfolio`                                    | Positions, sellable qty, avg cost, P&L                                                                     |
| `src/core/watchlists`                                   | Watchlist rules                                                                                            |
| `src/core/shared`                                       | Ids, Clock port, errors, invariant helper                                                                  |
| `src/infra/db`                                          | Drizzle schema, client, repositories                                                                       |
| `src/infra/brokers/alpaca`                              | Alpaca adapter: REST + SSE clients, status/event translation — **vendor types never leave this directory** |
| `src/infra/market-data`                                 | Alpaca IEX adapter, fixture provider, caching decorator                                                    |
| `src/server`                                            | Web composition root, auth, API handlers, middleware                                                       |
| `src/worker`                                            | Worker composition root: ingest loop, cursor mgmt, reconciliation triggers, health HTTP                    |
| `src/app` / `src/components` / `src/lib` / `src/styles` | Next.js routes, UI components, client utils, tokens                                                        |

## Frontend architecture

App Router; server components for initial reads, client components for live surfaces. All client data access goes through `/api/v1` + a typed client (`lib/api.ts`, shared Zod schemas). Realtime model: TanStack Query polls open orders at **2s while any order is non-terminal**, else pauses; quotes at 10–15s in market hours; terminal transitions invalidate portfolio/ledger queries. The UI renders exact lifecycle states and a pipeline-health banner — it never optimistically shows FILLED. SSE push from the worker is the documented upgrade path (ADR-010).

## Backend/application architecture

Route handlers are thin (parse → auth → `server/api/<resource>` → map result). All domain behavior lives in `core`, constructed in `container.ts` with ports injected; `core` never reads env or imports drizzle; time is always injected. **Transactions are owned by application services.** Order placement spans web → broker deliberately: `OrderService.place()` (validate, reserve under lock, insert PENDING_SUBMISSION, commit) then `ExecutionService.submit()` (broker REST; ack/reject as canonical events) — submission after commit so a crashed submit is recoverable by reconciliation.
