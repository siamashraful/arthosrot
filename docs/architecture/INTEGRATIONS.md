# External integrations

> **Purpose:** every external service: why it's used, its free-tier limits, how it's abstracted, how to replace it, and when paying becomes appropriate.
> **Audience:** developers and operators. **Belongs here:** provider facts + replacement paths. **Lives elsewhere:** execution semantics (EXECUTION.md), deploy steps (DEPLOYMENT.md).

## Alpaca Broker API — Sandbox (execution venue)

- **Why:** realistic multi-user paper execution — isolated brokerage accounts per user created via API, venue-managed market/limit matching, fills, partial fills, DAY expiration, replayable SSE events. Vastly more realistic than an in-house simulator under serverless constraints.
- **Free tier:** sandbox is free and self-serve (broker-app.alpaca.markets/sign-up), "unlimited sandbox testing". Real prices and market hours hold in sandbox. Rate limit ~1,000 req/min (per-account for account-scoped endpoints; watch `X-RateLimit-*` headers).
- **Key mechanics:** accounts auto-approved with synthetic KYC; funding simulated (instant credit or journals from the pre-funded firm account); orders at `/v1/trading/accounts/{id}/orders` with `client_order_id` idempotency (duplicate → 409); trade events at `/v2/events/trades` (SSE, replayable via `since_ulid`/ULID cursors; per-execution `execution_id` on fills); numbers arrive as JSON strings.
- **Limitations / risks:** contractually a development/testing environment — an indefinitely public prototype is a gray zone; sandbox data may be purged; simulated liquidity (see ../LIMITATIONS.md). Sandbox state is treated as **disposable** — Arthosrot's ledger + canonical events are the durable record.
- **Abstraction:** `Broker` port + canonical events; vendor types confined to `src/infra/brokers/alpaca`.
- **Replacement:** any broker adapter passing the compliance suite; DeterministicPaperBroker is a same-contract emergency fallback venue.
- **Paid trigger:** going live (production Broker API relationship) or sandbox policy change.

### Sandbox funding behaviour (verified against the live sandbox, 2026-08-27)

Findings from the first real runs of `pnpm test:external`. These are venue
behaviours that recorded fixtures cannot reproduce:

| Behaviour                                  | Detail                                                                                                                                                                                                                                                                                 | Consequence                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Daily transfer cap**                     | `POST /v1/accounts/{id}/transfers` rejects with `40010001 maximum total daily transfer allowed is $50000`.                                                                                                                                                                             | `STARTING_CASH_MAX` must stay **<= 50000** (enforced in `src/env.ts`).                                      |
| Cap is **per account**, not firm-wide      | Three separate accounts each funded 50,000 on the same day.                                                                                                                                                                                                                            | Does not limit how many users we onboard.                                                                   |
| **ACH funding is asynchronous**            | The transfer returns HTTP 200 at `status: QUEUED`, and the trading account reports `cash: 0` for **several minutes** before flipping to `COMPLETE` with the full balance. It is not instant, and it is not immediate-failure either: polling for 60s is not long enough to observe it. | **`provisionAccount()` must not report success until the venue reports the cash.** See the open item below. |
| ACH does **not** draw on firm cash         | Three customer accounts each hold 50,000 while the firm account holds 0.                                                                                                                                                                                                               | Firm sandbox balance is irrelevant to customer funding.                                                     |
| Journals (`JNLC`) **do** draw on firm cash | A 50,000 journal drained the firm account to 0 and stayed `pending`.                                                                                                                                                                                                                   | Not a viable funding path in sandbox; ACH is the correct one.                                               |

**Resolved — asynchronous provisioning.** Accounts now stay PROVISIONING
until the venue reports the starting cash as settled
(`AccountProvisioner.settledCash`, gated activation in
`AccountService.tryActivate`); the DEPOSIT posts at activation, so the ledger
and the venue balance cannot disagree by construction. Activation is driven by
the user's own `getMe` polling and by the worker's `activatePendingAccounts`
sweep — both idempotent under the account row lock. The onboarding UI shows an
honest "setting up your account" state while funding settles.

## Alpaca Market Data — free IEX feed (display data)

- **Why:** instrument search, bid/ask/last quotes, historical candles.
- **Free tier:** IEX-only feed (~2–3% of US volume — prices may differ from the consolidated tape _and_ from the venue's execution reference); 200 req/min; requires a (free) Trading API account for keys; websocket available.
- **Abstraction:** `MarketDataProvider` port; `CachedProvider` decorator (TTLs: quotes 10s in-hours, candles 1h intraday/24h daily, search 24h, market status 60s; DB-backed cache; provider failures serve cached values **flagged stale**).
- **Disclosure:** UI shows "Market data from IEX via Alpaca…" + freshness chips; execution price rendered separately from displayed quotes.
- **Replacement:** Finnhub (quotes/search free; candles paid), Twelve Data (800 req/day), Polygon, paid Alpaca SIP — adapter swap only.
- **Paid trigger:** need for consolidated/real-time tape or > 200 req/min.
- **Independence rule:** the market-data adapter and broker adapter share nothing beyond an optional credential helper — either is swappable without the other.

## Hosting — Vercel Hobby (web) + Render Free (worker)

- **Why:** zero-config Next.js hosting; the worker needs a long-lived outbound SSE connection that serverless can't hold.
- **Limits:** Vercel Hobby is non-commercial with bandwidth/function-duration caps. Render Free: 750 h/mo (24/7 capable), **sleeps after 15 min without inbound traffic**, ~30–60s wake, 512MB. Sleep gaps are safe: replayable cursors + the reconciliation schedule bound worst-case event latency; the UI discloses pipeline staleness.
- **Replacement:** Cloudflare Pages/Workers or Netlify (web); Koyeb Free (1h idle scale-to-zero), Oracle Always Free VM (true always-on, heavier ops), or any ~$5 VPS (worker).
- **Paid trigger:** commercial use (Vercel) or a need for guaranteed sub-second event delivery around the clock (~$7/mo Render starter).

## Database — Neon Free (Postgres)

- **Limits:** 0.5GB storage, ~190 compute-hrs/mo, scale-to-zero cold starts (~500ms). **Allowed to sleep** — no keep-alive pings; cold starts are absorbed by UI loading states.
- **Abstraction:** standard Postgres + Drizzle; no Neon-specific SQL. **Replacement:** any Postgres via `pg_dump` + `DATABASE_URL`. **Paid trigger:** >0.5GB or always-on need (Neon Launch $19).

## Auth — Better Auth (self-hosted OSS)

No external service; runs in our app/DB. Replacement seam: `getSession()`. Never a forced paid tier.

## CI — GitHub Actions

Free for public repos. Workflows: `ci.yml` (merge gate), `reconcile.yml` (market-hours reconciliation trigger — genuine work, not decorative keep-alive), `external-smoke.yml` (manual sandbox tests). Replacement: any CI running the same pnpm scripts.

## Email — deferred (Resend free tier, 100/day, when password reset lands)

`EmailProvider` port with a noop MVP implementation. Replacement: Postmark/SES/SMTP.

## Error tracking — optional later (Sentry free 5k events/mo)

pino stdout logs at MVP; thin reporter hook if adopted. Replacement: GlitchTip, Axiom.
