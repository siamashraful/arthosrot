# Ledgerline

A paper-trading platform for US equities that behaves like a credible modern brokerage: users get an isolated simulated brokerage account with $100,000, search instruments, view bid/ask/last quotes and charts, place **market and limit orders** with a real asynchronous order lifecycle (acknowledgement, fills, partial fills, cancellation, expiration), and track positions, P&L, and an immutable transaction ledger. Simulated money only — the UI says so persistently.

**Status: MVP built and tested; deployment pending.** All application phases through hardening are implemented with passing unit, integration, and E2E suites; a short list of deliberately deferred UI niceties and the deployment steps (owner provider accounts required) are tracked in [docs/ROADMAP.md](docs/ROADMAP.md). Realism and data limitations are documented honestly in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Architecture in ten lines

- Modular monolith in one TypeScript repo, **two deployables from the same codebase**: the Next.js web app (UI + REST `/api/v1`) and a small event/reconciliation **worker**.
- All business logic lives in framework-free [`src/core`](src/core) behind explicit module boundaries (lint-enforced). PostgreSQL is Ledgerline's system of record.
- Execution goes through a canonical **Broker port**: deployed venue is the **Alpaca Broker API Sandbox** (one isolated sandbox brokerage account per user; broker-managed limit matching and fills), while tests/CI/local use a **DeterministicPaperBroker** implementing the identical contract.
- The worker consumes the broker's **replayable SSE event stream**, translates vendor events into canonical BrokerEvents, and applies them transactionally (order state, fills, ledger, positions, cash). A REST **reconciliation engine** heals missed events exactly-once.
- Market data is a separate **MarketDataProvider port** (free Alpaca IEX feed + deterministic fixtures). The broker is authoritative for execution facts; Ledgerline's append-only ledger is the authoritative financial history.

```
Browser ──▶ Next.js (Vercel) ──▶ core services ──▶ Postgres (Neon)
                 │ submit orders (REST)                 ▲
                 ▼                                      │ canonical events, atomically
        Alpaca Broker Sandbox ── replayable SSE ──▶ Worker (Render) ──▶ reconciliation
```

Full picture: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) · execution model: [docs/architecture/EXECUTION.md](docs/architecture/EXECUTION.md) · decisions: [docs/architecture/adr/](docs/architecture/adr/).

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 11 (`corepack enable pnpm` or https://pnpm.io/installation)
- Docker (optional — only for the local Postgres once the database phase lands)

## Quick start

```bash
git clone <repo-url> ledgerline && cd ledgerline
pnpm install
cp .env.example .env.local
pnpm dev            # web app on http://localhost:3000
pnpm dev:worker     # event/reconciliation worker on http://localhost:8090 (separate terminal)
```

The defaults run **fully offline**: `BROKER_PROVIDER=deterministic` and `MARKET_DATA_PROVIDER=fixture` — no external accounts or network needed. Database setup (`docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`) arrives with the database phase; see ROADMAP.

## Commands

| Command                           | What it does                                                        |
| --------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:worker`    | Run web app / worker in watch mode                                  |
| `pnpm build` / `pnpm start`       | Production build / serve of the web app                             |
| `pnpm test` / `pnpm test:watch`   | Unit + integration tests (Vitest; never touches live Alpaca)        |
| `pnpm test:e2e`                   | Playwright E2E (desktop + mobile projects, deterministic providers) |
| `pnpm lint`                       | ESLint incl. module-boundary rules                                  |
| `pnpm typecheck`                  | TypeScript, strict                                                  |
| `pnpm format` / `pnpm format:fix` | Prettier check / write                                              |

## Environment

Every variable is documented in [.env.example](.env.example). Highlights: `BROKER_PROVIDER` (`deterministic` \| `alpaca-paper`), `MARKET_DATA_PROVIDER` (`fixture` \| `alpaca`), `DATABASE_URL`, `STARTING_CASH`, `MARKET_BUY_BUFFER`, `CRON_SECRET`. Secrets are never committed; deployment values are covered in [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md).

## Repository map

| Path                                         | What lives there                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/core/`                                  | Framework-free domain modules (money, orders, execution, ledger, portfolio, …) — the heart of the system |
| `src/infra/`                                 | Adapters implementing core ports (Postgres repositories, Alpaca broker + market data, fixtures)          |
| `src/server/`                                | Web composition root, auth, API handlers                                                                 |
| `src/worker/`                                | Event-ingestion/reconciliation worker entrypoint                                                         |
| `src/app/`                                   | Next.js routes (pages + `/api/v1/*`)                                                                     |
| `src/components/`, `src/lib/`, `src/styles/` | UI components, client utilities, design tokens                                                           |
| `tests/`                                     | integration / contract / e2e / **external** (sandbox smoke — excluded from CI) / fixtures                |
| `drizzle/`                                   | Committed SQL migrations                                                                                 |
| `docs/`                                      | All documentation (index below)                                                                          |

## Testing

Unit and contract tests are deterministic and offline (fixture market data, DeterministicPaperBroker, injected clock). Integration tests use a real Postgres. The Broker compliance suite runs against both broker implementations. `tests/external/` talks to the real Alpaca sandbox and runs only via the manual `external-smoke` workflow — **CI never depends on live Alpaca**. Details: [docs/architecture/EXECUTION.md](docs/architecture/EXECUTION.md), invariant↔test map: [docs/architecture/FINANCIAL_INVARIANTS.md](docs/architecture/FINANCIAL_INVARIANTS.md).

## Documentation index

- [docs/PRODUCT.md](docs/PRODUCT.md) — what this is and why (read first)
- [docs/MVP.md](docs/MVP.md) — scope, non-goals, open decisions
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — functional + non-functional requirements
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases and current status
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — honest realism limitations
- [docs/architecture/](docs/architecture/) — system, execution, data model, boundaries, security, invariants, integrations, deployment, ADRs
- [docs/design/](docs/design/) — design system, responsive behavior, accessibility, UX patterns
- [docs/specs/](docs/specs/) — per-feature specifications ([template](docs/specs/_TEMPLATE.md))
- [CLAUDE.md](CLAUDE.md) — standing rules for AI coding agents working in this repo
