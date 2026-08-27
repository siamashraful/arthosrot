# CLAUDE.md — Arthosrot

Paper-trading platform with external broker-managed execution. Financial correctness outranks everything. Read docs/ROADMAP.md for current state and the feature spec in docs/specs/ before implementing.

## Architecture rules

- Dependency direction: app → server → core ← infra; worker → core, infra. `src/core` must not import next, react, drizzle, or vendor SDKs. Modules interact only via index.ts exports; never touch another module's tables.
- Vendor objects never leave infra/brokers/<vendor> or infra/market-data/<vendor>. The domain consumes canonical BrokerEvents and port types only. Broker and MarketDataProvider are independent ports — never couple them.

## Execution rules

- When an external broker is configured, broker events are the authority for execution facts. Canonical broker events are the ONLY input that mutates execution-derived financial state (order state, fills, TRADE ledger entries, positions, cash projection).
- Never mark an order FILLED (or any state) except by applying a canonical event through applyTransition. Never re-create broker fill logic in UI or application services.
- The same external event must never produce financial effects twice — preserve the unique external_event_id / execution_id constraints and the idempotent apply path.
- Fill price/qty/timestamp are immutable historical facts. Never recompute them from market data.
- Stream ingestion must always have its reconciliation fallback; never remove or bypass reconciliation because "the stream works".
- DeterministicPaperBroker is for local/test/offline. It implements the same contract and must keep passing the full Broker compliance suite — it is not a second semantics.
- Limit orders are an MVP feature executed by the broker. Never replace them with a timer-based local approximation.

## Financial rules

- Money/prices only via Money/Px/Qty from core/money. No JS number arithmetic on financial values; no parseFloat on money strings. HALF_EVEN, once per derivation.
- ledger_entries, fills, order_events are append-only. Corrections are new ADJUSTMENT entries.
- Placement and event-application must keep their transaction + FOR UPDATE lock structure (account → order → position). Do not "simplify" locking away.
- Reservations (buying power, sellable shares) follow docs/architecture/FINANCIAL_INVARIANTS.md formulas; recompute inside the placement lock.

## Safety rules

- accounts.mode is PAPER-only (DB CHECK). Only paper broker kinds exist. Never add live-broker code, hostnames, or credentials, or relax that constraint, without an explicit human-approved ADR.
- No real user PII in sandbox KYC payloads — synthetic data only.
- Never render a price without freshness context. Never present local order state as live when the pipeline is degraded.
- No secrets in client code; process.env only in src/env.ts.

## Process rules

- Schema changes only via drizzle-kit migrations; never edit committed migrations; destructive migrations need a `-- destructive:` header + human sign-off.
- Changes to core/orders, core/execution, core/reconciliation, core/ledger, core/portfolio require tests in the same PR, including mapped invariant tests.
- Update affected docs in the same PR — never as a follow-up.
- Stay in scope: no unrelated refactors; no new dependencies without an ADR note; no design-token bypasses.
- CI never depends on live Alpaca; external tests live in tests/external only.
- Before merge: pnpm lint && pnpm typecheck && pnpm test && pnpm build must pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
