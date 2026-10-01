# External integrations

> **Purpose:** every external service: why it's used, its free-tier limits, how it's abstracted, how to replace it, and when paying becomes appropriate.
> **Audience:** developers and operators. **Belongs here:** provider facts + replacement paths. **Lives elsewhere:** execution semantics (EXECUTION.md), deploy steps (DEPLOYMENT.md).

## Alpaca Broker API — Sandbox (execution venue)

- **Why:** realistic multi-user paper execution — isolated brokerage accounts per user created via API, venue-managed market/limit matching, fills, partial fills, DAY expiration, replayable SSE events. Vastly more realistic than an in-house simulator under serverless constraints.
- **Free tier:** sandbox is free and self-serve (broker-app.alpaca.markets/sign-up), "unlimited sandbox testing". Real prices and market hours hold in sandbox. Rate limit ~1,000 req/min (per-account for account-scoped endpoints; watch `X-RateLimit-*` headers).
- **Key mechanics:** accounts auto-approved with synthetic KYC; funding simulated (instant credit or journals from the pre-funded firm account); orders at `/v1/trading/accounts/{id}/orders` with `client_order_id` idempotency (duplicate → 409); trade events at `/v2/events/trades` (SSE, replayable via `since_ulid`/ULID cursors; per-execution `execution_id` on fills); numbers arrive as JSON strings.
- **Fill activities (the reconciliation path):** `GET /v1/accounts/activities/FILL?account_id={id}` — the account is a **query parameter**; `/v1/accounts/{id}/activities/…` does not exist (404). Verified 2026-09-30: an activity's `execution_id` is `null` and its `id` is `<timestamp>::<uuid>`, where the uuid **is** the stream event's `execution_id`; the adapter normalizes to that form so a fill seen by both the stream and reconciliation books exactly once. Any error from this endpoint throws, and a venue `filled_qty` larger than the visible executions raises `IncompleteFillsError` — reconciliation marks the account ERROR instead of reporting a filled order as in sync. (Incident: until 2026-09-30 the adapter called the non-existent path, treated the 404 as "no fills", and a Sep 3 market-open fill stayed invisible for 27 days while reconciliation reported HEALTHY.)
- **Limitations / risks:** contractually a development/testing environment — an indefinitely public prototype is a gray zone; sandbox data may be purged; simulated liquidity (see ../LIMITATIONS.md). Sandbox state is treated as **disposable** — Arthosrot's ledger + canonical events are the durable record.
- **Abstraction:** `Broker` port + canonical events; vendor types confined to `src/infra/brokers/alpaca`.
- **Replacement:** any broker adapter passing the compliance suite; DeterministicPaperBroker is a same-contract emergency fallback venue.
- **Paid trigger:** going live (production Broker API relationship) or sandbox policy change.

### Sandbox funding behaviour (verified against the live sandbox, 2026-08-27)

Findings from the first real runs of `pnpm test:external`. These are venue
behaviours that recorded fixtures cannot reproduce:

| Behaviour                                                                       | Detail                                                                                                                                                                                                                                                                              | Consequence                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily transfer cap**                                                          | `POST /v1/accounts/{id}/transfers` rejects with `40010001 maximum total daily transfer allowed is $50000`.                                                                                                                                                                          | `STARTING_CASH_MAX` must stay **<= 50000** (enforced in `src/env.ts`).                                                                                                                    |
| Cap is **per account**, not firm-wide                                           | Three separate accounts each funded 50,000 on the same day.                                                                                                                                                                                                                         | Does not limit how many users we onboard.                                                                                                                                                 |
| **ACH funding is asynchronous BY DESIGN**                                       | Alpaca's docs: transfers reflect "after around 10–30 minutes (to simulate ACH delay)". Observed live: `QUEUED` → `SENT_TO_CLEARING` (~t+8m) → `COMPLETE`. Some doc pages claim sandbox ACH settles instantly; the 10–30 min pages match observed behaviour — trust the observation. | **`provisionAccount()` must not report success until the venue reports the cash** — implemented as gated activation (`tryActivate`). Onboarding copy states the 10–30 min range honestly. |
| ACH does **not** draw on firm cash                                              | Three customer accounts each hold 50,000 while the firm account holds 0.                                                                                                                                                                                                            | Firm sandbox balance is irrelevant to ACH funding — signup capacity is unconstrained ($50k/account/day each).                                                                             |
| Journals (`JNLC`) are **also batch-processed** and draw on the finite firm pool | Docs advertise journals as "near instantaneous" (sub-second in their own example); observed live: `queued` → `pending` for many minutes before `executed`, and each journal consumes firm cash (pre-funded $50,000 total).                                                          | No latency win over ACH, plus a capacity ceiling. ACH remains the correct funding path.                                                                                                   |
| **Instant Funding API exists but is sales-gated**                               | Docs: testable in sandbox, but "reach out to your sales representative … who will enable this feature"; commercial terms and a deposit are required.                                                                                                                                | Not self-serve; not worth pursuing for a paper-trading MVP. Revisit if a production Broker API relationship happens.                                                                      |

**Open item — sandbox order submission returns HTTP 500 (venue-side).**
Every `POST /v1/trading/accounts/{id}/orders` — market or limit, funded or
not, with or without a margin agreement — fails with
`{"code":50010000,"message":"internal server error occurred"}` (observed
2026-08-27 ~01:50–02:40 UTC, i.e. after US market hours; example
`X-Request-Id: 3f00173074a6db98138498864dcdee6f`). Alpaca's error guide calls
50010000 a server-side catch-all and staff describe it as the buying-power
calculator failing when no quote is available, which fits an after-hours
sandbox; a forum post the same day reports identical 500s against the broker
sandbox. Retest during market hours (09:30–16:00 ET); if it persists, contact
support@alpaca.markets with the request id. Note: `provisionAccount` now signs
the `margin_agreement` alongside the customer agreement (sandbox accounts are
margin-type; Arthosrot still enforces cash-only semantics locally).
Later evidence: a market BUY submitted after hours on 2026-09-02 was accepted
and filled at the next open (5 AAPL @ 324.85 — the fill-activities incident
above), so the 500s were not permanent; a full market-hours run of the order
slices is still open (ROADMAP Phase 18).

**Resolved — asynchronous provisioning.** Accounts now stay PROVISIONING
until the venue reports the starting cash as settled
(`AccountProvisioner.settledCash`, gated activation in
`AccountService.tryActivate`); the DEPOSIT posts at activation, so the ledger
and the venue balance cannot disagree by construction. Activation is driven by
the user's own `getMe` polling and by the worker's `activatePendingAccounts`
sweep — both idempotent under the account row lock. The onboarding UI shows an
honest "setting up your account" state while funding settles.

## Stock logos — keyless CDN via LOGO_UPSTREAM

Alpaca's logo API is **subscription-gated** on both broker and data keys
(verified 2026-09: `{"message":"Subscription does not permit querying
logos"}`), so at $0 the upstream is a keyless public CDN configured as a URL
template (`LOGO_UPSTREAM`, `{SYMBOL}` placeholder; production uses Parqet's
logo endpoint). Our server proxies and caches the bytes (`market_data_cache`,
7-day TTL) — the browser never talks to the third party. Misses and an unset
template fall back to the designed monogram tile, so CI runs hermetically
and the product degrades gracefully if the CDN disappears (local dev enables
the template in `.env.local` to see real logos). Replacement path: change one
env var.

CDN quirks handled: class-share tickers are dotted at the venue (`BRK.B`) but
hyphenated at the CDN (`BRK-B`) — the proxy maps `.` → `-`. Some marks are a
light glyph on transparency (drawn for dark grounds); `SymbolLogo` samples the
loaded image once on a 16px canvas and sets an ink backdrop for those, and
falls back to the monogram for an effectively empty image. SVG is never
proxied: served same-origin it could run script.

## Alpaca Market Data — free IEX feed (display data)

- **Why:** instrument search, bid/ask/last quotes, historical candles.
- **Free tier:** IEX-only feed (~2–3% of US volume — prices may differ from the consolidated tape _and_ from the venue's execution reference); 200 req/min; requires a (free) Trading API account for keys; websocket available.
- **Quotes = one snapshots call per batch** (`GET /v2/stocks/snapshots?symbols=…&feed=iex`, ≤ 200 symbols per request; replaced quotes/latest + trades/latest on 2026-09-30). Top-level keys are symbols (unknown symbols are absent); each carries `latestQuote`, `latestTrade`, `dailyBar`, `prevDailyBar`. `last`/`bid`/`ask`/`ts` are unchanged; **`previousClose`** feeds day change. **Reference-close rule:** the close of the session before the one the last trade belongs to — normally `prevDailyBar.c`, but pre-market on a new day (last trade's ET date later than `dailyBar`'s) it is `dailyBar.c`. Contract-tested both ways.
- **Abstraction:** `MarketDataProvider` port; `CachedMarketData` decorator (`src/infra/market-data/cached.ts` — TTLs: quotes 10s in-hours / 60s closed, candles 1h intraday (1D/1W) / 24h daily, market status 60s; search is not cached (instrument search is DB-backed); DB-backed cache shared by serverless instances + in-memory memo; provider failures serve cached values **flagged stale**).
- **Candles:** `1D` is the most recent **session**, not the last 24 hours — the adapter fetches 5-minute bars over a 6-day lookback and keeps the latest session, so weekends and Monday pre-market still show a chart (contract-tested). The instrument page's 52-week range reads the `1Y` daily bars.
- **Disclosure:** UI shows "Market data from IEX via Alpaca…" + freshness chips; execution price rendered separately from displayed quotes.
- **Replacement:** Finnhub (quotes/search free; candles paid), Twelve Data (800 req/day), Polygon, paid Alpaca SIP — adapter swap only.
- **Paid trigger:** need for consolidated/real-time tape or > 200 req/min.
- **Independence rule:** the market-data adapter and broker adapter share nothing beyond an optional credential helper — either is swappable without the other.

## SEC EDGAR — share counts for the Top 100 (display data)

- **Why:** the Markets "Top 100" ranks US companies by market value = shares outstanding × IEX last price. The IEX feed has no share counts; EDGAR is free, keyless and official. Adapter: `src/infra/sec-edgar` (vendor shapes confined there), port `SharesOutstandingSource` in `core/discovery`.
- **Fair access:** every request sends `User-Agent: $SEC_USER_AGENT` (a name + contact email — anonymous agents get **403**, verified); requests are spaced ≥ 120 ms (SEC's ceiling is 10/s). One run ≈ 12 bulk calls + ~100 SIC lookups, once a day.
- **Bulk frames** (one call returns one fact per filer per calendar period; frames are "closest fit", so the adapter reads a window of recent quarters and keeps each filer's newest value):
  - `dei/EntityCommonStockSharesOutstanding` (instant) — the 10-Q/10-K **cover-page** count: current, but multi-class filers tag it per class and drop out (Alphabet, Meta).
  - `us-gaap/WeightedAverageNumberOfSharesOutstandingBasic` (quarter) — total across classes, a quarter behind. Used for multi-class filers and filers without a cover count; when both exist and the weighted average is > 50× or < ½ the cover count it's a mis-scaled filing (seen: Waters at 1,000×) and the cover count wins.
  - `dei/EntityPublicFloat` (instant, annual) — an **independent dollar figure**: a computed value outside 0.2×–25× of the filer's own public float is rejected as mis-scaled (logged, not ranked).
- **Ticker map:** `www.sec.gov/files/company_tickers.json` (CIK → tickers; class tickers only — `BRK-B` → `BRK.B`; preferreds/units dropped). **Industry:** `submissions/CIK##########.json` `sic` — SIC 6221/6722/6726 (commodity/crypto trusts, funds: GLD, SLV, IBIT file 10-Qs too) are excluded.
- **Universe:** SEC domestic filers listed in our instruments catalog. **Depositary receipts are excluded** (the filing counts ordinary shares, the listing trades ADS units — recognised by the catalog name "ADS"/"ADR"/"Depositary").
- **Overrides** (`core/discovery/share-overrides.ts`, each with its source): Berkshire (class-B equivalents: A × 1,500 + B), Visa (as-converted class A), Citigroup (absent from the frames); exclusions for filers whose XBRL is mis-scaled everywhere (Repay) and ADRs the catalog doesn't name as such (Diageo). The job **logs** large filers (public float ≥ $50B) it could not value and overrides older than 200 days — that log is the maintenance queue.
- **Key stats (instrument page):** the same job saves the share count of **every** company it can value (~4,600, one row per listed class) to `company_fundamentals` → market cap = shares × live last. **Trailing EPS** is fetched lazily on first view of a stock (`companyconcept/us-gaap/EarningsPerShareDiluted`, basic as fallback; ~50KB) and cached a day per company: TTM = last fiscal year + this year's YTD − last year's same YTD (bulk quarterly frames can't do this — fiscal Q4 exists only inside the 10-K). No matching YTD pair → fiscal-year EPS, labelled "(FY)". P/E = live last ÷ EPS, "n/m" for zero/negative earnings. The web needs `SEC_USER_AGENT` too for the EPS refresh; without it cached EPS serves (or none).
- **Validation before publishing:** ≥ 100 companies, ≥ 80% of candidates priced, ≥ 7 of the previous top 10 retained — otherwise the run is refused and the previous snapshot stays live.

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

Free for public repos. Workflows: `ci.yml` (merge gate; its `deploy-worker` job deploys the worker to Render after every gate passes on `main`), `migrate.yml` (approval-gated production migration), `reconcile.yml` (market-hours reconciliation trigger — genuine work, not decorative keep-alive), `jobs.yml` (hourly scheduled-jobs tick), `external-smoke.yml` (manual sandbox tests). Replacement: any CI running the same pnpm scripts.

## Email — deferred (Resend free tier, 100/day, when password reset lands)

Not implemented: `src/infra/email` is a placeholder and no `EmailProvider` port exists yet (no password reset or verification email at MVP). Replacement: Postmark/SES/SMTP.

## Error tracking — optional later (Sentry free 5k events/mo)

Structured JSON lines via `console` to stdout at MVP (no logging library); thin reporter hook if adopted. Replacement: GlitchTip, Axiom.
