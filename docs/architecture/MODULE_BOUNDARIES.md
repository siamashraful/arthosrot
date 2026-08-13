# Module boundaries

> **Purpose:** the dependency rules that keep the monolith modular — what may import what, and how it's enforced.
> **Audience:** everyone writing code. **Belongs here:** dependency direction, whitelisted edges, lock ordering. **Lives elsewhere:** module responsibilities (ARCHITECTURE.md).

## Dependency direction (lint-enforced: `boundaries/dependencies` in eslint.config.mjs)

```
app        → components, lib, server
components → components, lib
server     → core, infra, env
worker     → core, infra, env
infra      → core, env        (implements core ports)
core       → core only        (NOTHING external: no next, react, drizzle, vendor SDKs)
```

## Rules

1. **Public APIs only.** Each `core/<module>` exposes `index.ts`; deep imports (`@/core/orders/internal-file`) are lint-blocked (`no-restricted-imports`).
2. **No cross-module table access.** A module reads/writes only its own tables; cross-module needs go through the owning module's service interface.
3. **Whitelisted core edges** (anything else is a boundary violation to fix, not to whitelist casually):
   - `orders → instruments, accounts, money, shared`
   - `execution → orders, ledger, portfolio, market-data (port), brokers (port), money, shared`
   - `reconciliation → execution, orders, ledger, portfolio, brokers (port), shared`
   - `portfolio → market-data (port), instruments, money, shared`
   - `ledger → accounts, money, shared`
   - everything may use `money` and `shared`
4. **Vendor confinement.** Alpaca request/response/status types exist only inside `infra/brokers/alpaca` and `infra/market-data/alpaca.ts`. The two adapters share nothing except (optionally) a low-level credential helper — Broker and MarketDataProvider stay independently swappable.
5. **Environment** is read only via `src/env.ts` (lint: `no-restricted-properties` on `process.env`).
6. **Transactions** are owned by application services (e.g., ExecutionService), not repositories; repositories accept a `tx` handle.
7. **Lock ordering** (deadlock prevention): **account → order → position**, always.

## Verification

The boundary rule is verified live: a `core → infra` import fails `pnpm lint` (tested during scaffold). Keep it that way — if the linter setup changes, re-run the probe: add a temp file in `src/core/` importing from `@/infra/db` and confirm lint fails.
