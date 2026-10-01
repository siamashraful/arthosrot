# Module boundaries

> **Purpose:** the dependency rules that keep the monolith modular — what may import what, and how it's enforced.
> **Audience:** everyone writing code. **Belongs here:** dependency direction, whitelisted edges, lock ordering. **Lives elsewhere:** module responsibilities (ARCHITECTURE.md).

## Dependency direction (lint-enforced: `boundaries/dependencies` in eslint.config.mjs)

```
app        → app, components, lib, server
components → components, lib
lib        → lib only
server     → core, infra, env
worker     → core, infra, env, server (composition root container.ts ONLY — never HTTP handlers)
infra      → core, env        (implements core ports)
core       → core only        (NOTHING external: no next, react, drizzle, vendor SDKs)
```

## Rules

1. **Public APIs only.** Each `core/<module>` exposes `index.ts`; deep imports (`@/core/orders/internal-file`) are lint-blocked (`no-restricted-imports`). The one sanctioned exception is `@/core/brokers/deterministic` (the in-process venue; `core/brokers` has no top-level index).
2. **No cross-module table access.** A module reads/writes only its own tables; cross-module needs go through the owning module's service interface.
3. **Whitelisted core edges** (anything else is a boundary violation to fix, not to whitelist casually):
   - `orders → instruments, accounts, money, shared`
   - `execution → orders, ledger, portfolio, accounts (repository + broker-account types), money, shared` (defines the **Broker port** in `execution/broker.ts`)
   - `reconciliation → execution (Broker port), orders, ledger, accounts, shared`
   - `portfolio → market-data (port), money, shared`
   - `instruments → market-data (port), shared`
   - `ledger → money, shared` (defines the CashProjection port)
   - `discovery → market-data, money, shared` (browse catalog, Top 100 ranking rules, key-stats math — trailing EPS, P/E, 52-week range; defines the SharesOutstandingSource, MarketCapRankingStore and EarningsSource ports)
   - `accounts → ledger` (opening-deposit posting; implements CashProjection — lazy-injected to avoid a cycle)
   - `brokers/deterministic → execution (Broker port), orders, accounts, market-data, money, shared` (the offline venue implementing the same contract)
   - `funding → money, shared` (FundingProvider port only — no implementation; ADR-011); `watchlists` is a placeholder — watchlist storage lives in `infra/db/repositories/watchlists.ts`
   - everything may use `money` and `shared`
4. **Vendor confinement.** Alpaca request/response/status types exist only inside `infra/brokers/alpaca` and `infra/market-data/alpaca.ts`; SEC EDGAR shapes only inside `infra/sec-edgar`. The two adapters share nothing except (optionally) a low-level credential helper — Broker and MarketDataProvider stay independently swappable.
5. **Environment** is read only via `src/env.ts` (lint: `no-restricted-properties` on `process.env`).
6. **Transactions** are owned by application services (e.g., ExecutionService), not repositories; repositories accept a `tx` handle. Exception: display-data stores outside any financial transaction (market-data cache, market-cap rankings, company fundamentals, job runs) use the pool directly.
7. **Lock ordering** (deadlock prevention): **account → order → position**, always.

## Verification

The boundary rule is verified live: a `core → infra` import fails `pnpm lint` (tested during scaffold). Keep it that way — if the linter setup changes, re-run the probe: add a temp file in `src/core/` importing from `@/infra/db` and confirm lint fails.
