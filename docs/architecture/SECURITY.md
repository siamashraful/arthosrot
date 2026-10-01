# Security

> **Purpose:** the threat model, active controls, and the mandatory pre-live-trading checklist.
> **Audience:** implementers and security review. **Belongs here:** security posture. **Lives elsewhere:** auth mechanics (this doc summarizes; Better Auth config in src/server), deployment env handling (DEPLOYMENT.md).

## Authentication & sessions

Better Auth (OSS, self-hosted): email/password, scrypt hashing (no custom crypto), database sessions in our Postgres — HttpOnly, Secure, SameSite=Lax cookies; 30-day rolling, revocable server-side. Signup requires zxcvbn score ≥ 3. CSRF: Better Auth origin checks + SameSite; `BETTER_AUTH_URL` pins the trusted origin in deployed environments so origin checks never trust the request's own Host header (set it in Vercel — unset falls back to request-derived). Rate limits: 10/min on auth endpoints (Better Auth, production only); 60/min per user on order placement and 20/min per user on paper cash transfers (`src/server/api/rate-limit.ts` — in-memory, per serverless instance; a burst brake, not a distributed quota). Password recovery: deferred pending MVP.md open decision #2. The rest of the app sees only `getSession()` — the provider-swap seam. Signed-out page requests redirect to `/signin?next=<path>` (the (app) layout reads the path from the `x-arthosrot-path` header `src/proxy.ts` always overwrites; the proxy makes no auth decision); `next` is honoured only as a same-origin in-app path (`src/lib/return-path.ts` refuses full URLs, `//host`, backslashes, control characters and auth pages), so sign-in is not an open redirect. A 401 from `/api/v1` under an open page (expired session, signed out elsewhere) clears the query cache and goes to sign-in once with the same return path (`components/providers.tsx`).

## Authorization

Single role (user). Every query is filtered by the session's account at the repository call site; cross-user access returns 404 (integration-tested). Resource ownership is checked server-side, never trusted from params. Paper cash endpoints (`GET /api/v1/account/cash`, `POST /api/v1/account/transfers`, ADR-015) take no account id at all — they act on the session user's current account only; no account ⇒ 404 `NO_ACCOUNT`. Transfers require an `Idempotency-Key` UUID header; the amount is a decimal string validated server-side into Money (no float coercion), and every limit (1.00–50,000.00 per transfer, $50k/24h deposits, withdrawable) is re-checked under the account lock. Price alerts (ADR-016) are scoped to the session user: list/read/unread-count filter by user id, `DELETE /api/v1/alerts/[id]` on another user's (or a malformed/unknown) id is 404, and `POST /api/v1/alerts/read` only stamps the caller's own rows even when given other ids; creation is rate-limited (30/min per user) and capped at 50 active alerts.

## Application controls

- **Input:** Zod on every boundary (API bodies/params, env via `src/env.ts`); the worker's cron bearer token is a constant-time compare.
- **Output:** React escaping; no `dangerouslySetInnerHTML` (single sanctioned exception: the constant theme/mode-bootstrap script in `src/app/layout.tsx` — static string, no user input); security headers via next.config (nosniff, referrer-policy, frame-deny, HSTS, permissions-policy); CSP remains future hardening (Next inline scripts need nonce plumbing).
- **SQLi:** Drizzle parameterized queries; raw SQL only via the parameterized `sql` template — string-concatenated SQL is review-blocked.
- **SSRF:** outbound calls go only to pinned base-URL constants (Alpaca broker sandbox + data, SEC EDGAR `data.sec.gov` / `www.sec.gov`) plus the operator-configured `LOGO_UPSTREAM` template; no user-supplied URLs are fetched. The logo proxy serves third-party bytes same-origin, so it passes only raster types (PNG/JPEG/WebP/GIF — never SVG), caps bodies at 512 KB, and sends `X-Content-Type-Options: nosniff`.
- **Secrets:** env vars only; `.env.example` documents all; gitleaks in CI; logging is structured console JSON that never includes credentials, tokens, or request bodies; `order_events.raw_payload` passes a redaction filter before persistence; no secrets in client bundles (`process.env` only in src/env.ts; no `NEXT_PUBLIC_` secrets).
- **Dependencies:** lockfile committed; Dependabot weekly (npm + actions).
- **Errors:** one envelope (`src/server/api/http.ts`); internal causes are logged with a request id (also returned as `x-request-id`), never sent to the client. Client mistakes never surface as 500s: a malformed JSON body (`readJson`) or badly percent-encoded path segment (`pathParam`) is 422 `VALIDATION`, and every body/query/param is Zod-validated (`tests/integration/api-hardening.test.ts`). The worker's `/reconcile` responds pass/fail only and `/jobs/tick` returns job names + statuses only (errors stay in the log); their `CRON_SECRET` check is constant-time.
- **Transport:** HTTPS everywhere (platform TLS) + HSTS (2y, includeSubDomains).

## Broker-integration specifics

- Alpaca sandbox keys are **firm-level secrets** in web/worker env only — never client-side, never in per-user rows.
- **Synthetic KYC only:** no real user PII is ever sent to the sandbox.
- The adapter pins the **sandbox** base URL; the production broker-api hostname appears nowhere in the codebase at MVP.
- `order_events.raw_payload` passes a redaction filter before persistence.
- Worker HTTP surface: `/healthz` + `POST /reconcile` and `POST /jobs/tick` (both CRON_SECRET-guarded) only.

## Paper/live isolation (defense in depth, MVP-active)

1. `accounts.mode` DB CHECK allows only 'PAPER'.
2. The broker registry contains only DETERMINISTIC and ALPACA_PAPER kinds — no live adapter code exists.
3. ExecutionService asserts `broker.kind` is a paper kind (alert-level log on violation) — `src/core/execution/execution.ts` constructor guard.
4. No live credentials exist in any environment.
5. Persistent mode ribbon: "Practice: simulated money". The Settings "live" switch is a client-side visual PREVIEW only (ADR-011): its ribbon says "Live preview: real trading isn't available yet", live surfaces render only their own empty states (never paper data re-badged as live), and nothing server-side changes. The live deposit/withdraw sheets are non-functional by design. Paper cash transfers (ADR-015) live in their own module (`core/cash-transfers`), run only against the paper venues (deterministic / Alpaca **sandbox** ACH with the synthetic bank relationship), and never touch the unimplemented live `FundingProvider` port.

## Mandatory before any live trading (not built at MVP; do not delete this list)

Separate deployment + environment for live · live credentials only there · per-account mode migration with explicit user opt-in + real KYC · independent kill-switch env (`LIVE_TRADING_ENABLED`) · MFA + re-auth for trades · per-order confirmations + anomaly limits · broker adapter contract tests + reconciliation jobs against the live venue · audited logging/retention · regulatory review. The `mode` CHECK is relaxed only by a deliberate, human-approved ADR + migration.
