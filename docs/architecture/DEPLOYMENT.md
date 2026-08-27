# Deployment

> **Purpose:** how each environment is set up and released, end to end, at $0/month.
> **Audience:** whoever deploys or operates. **Belongs here:** environment setup, env vars, release steps, operational endpoints. **Lives elsewhere:** provider facts (INTEGRATIONS.md), security posture (SECURITY.md).

## Environments

| Env        | Web                   | Worker            | DB                                   | Providers                                        |
| ---------- | --------------------- | ----------------- | ------------------------------------ | ------------------------------------------------ |
| local      | `pnpm dev`            | `pnpm dev:worker` | Docker Postgres (or Neon branch)     | deterministic + fixture (default; fully offline) |
| preview    | Vercel preview per PR | — (not needed)    | Neon preview branch (GH integration) | deterministic + fixture                          |
| production | Vercel Hobby          | Render Free       | Neon main branch                     | alpaca-paper + alpaca                            |

## One-time setup (production)

1. Public GitHub repo.
2. **Neon:** create project; `main` branch = prod DB; enable the GitHub integration for preview branches. No keep-alive pings — Neon is allowed to sleep; cold starts are absorbed by loading states.
3. **Alpaca:** create the free Broker Dashboard sandbox team (broker-app.alpaca.markets/sign-up) → sandbox key/secret. Separately create a free Trading API account → market-data key/secret (IEX feed).
4. **Vercel:** import repo (Hobby). Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ALPACA_BROKER_KEY/SECRET`, `ALPACA_DATA_KEY/SECRET`, `BROKER_PROVIDER=alpaca-paper`, `MARKET_DATA_PROVIDER=alpaca`, `STARTING_CASH_MIN=1000`, `STARTING_CASH_MAX=25000`, `STARTING_CASH_DEFAULT=10000`, `MARKET_BUY_BUFFER=0.025`, `CRON_SECRET`.
5. **Render:** create the worker from `render.yaml` (free plan); set the `sync: false` env vars (same values as Vercel where shared).
6. **GitHub Actions secrets:** `WORKER_URL`, `CRON_SECRET` (for reconcile.yml); Alpaca sandbox creds for external-smoke.yml.
7. Verify this document from scratch — if a step surprised you, fix the doc in the same PR.

## Release flow

- **Web:** Vercel Git integration — preview per PR; production deploy on `main` after CI passes.
- **Worker:** Render auto-deploy from `main` (render.yaml).
- **Migrations:** explicit approval-gated workflow job against the prod DB **before** the deploy promotes — never automatic on cold start. Destructive migrations follow DATA_MODEL.md's sign-off rules.

## Scheduled operations

- `reconcile.yml`: `*/10 13:25–21:05 UTC, Mon–Fri` (≈ US market hours incl. pre-open warmup) → `POST $WORKER_URL/reconcile` with `CRON_SECRET`. This performs **genuine reconciliation** and, as a side effect, wakes a slept Render instance before the open. GitHub schedules are best-effort (≥5 min, can be delayed) — acceptable because replayable SSE cursors make catch-up exactly-once; the schedule is a bound on staleness, not the delivery mechanism.
- `external-smoke.yml`: manual dispatch (optionally weekly) — runs `tests/external` against the real sandbox.

## Operational endpoints

| Endpoint                    | Where  | Semantics                                                                     |
| --------------------------- | ------ | ----------------------------------------------------------------------------- |
| `GET /api/health/live`      | web    | Process responds; no dependency checks                                        |
| `GET /api/health/ready`     | web    | DB reachable                                                                  |
| `GET /healthz`              | worker | DB reachable (503 otherwise); stale event/reconcile activity degrades status  |
| `POST /reconcile`           | worker | CRON_SECRET-guarded reconciliation trigger                                    |
| `GET /api/v1/system/status` | web    | Cached pipeline/provider health for the UI banner — never spends vendor calls |

A market-data or broker outage must never mark the web process itself unhealthy — external status is observed separately (system/status), and monitoring must not consume scarce market-data calls.

## Cost table

| Stage                                      | Total/mo     | Notes                                                                                                             |
| ------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Local dev                                  | $0           | Docker + deterministic/fixture providers                                                                          |
| Deployed MVP (<100 users, non-commercial)  | **$0**       | Vercel Hobby + Render Free + Neon Free + Alpaca sandbox/IEX + GH Actions                                          |
| Small production (~1–5k users, commercial) | ~$50–200     | Vercel Pro $20 / CF ~$5 · Render $7 or VPS $5 · Neon $19 · SIP data $0–99 · email/observability $0–46             |
| Real-money trading                         | four-figure+ | Compliance-driven: production Broker API agreement, SIP, KYC provider, audited logging, HA DB, pen-testing, legal |
