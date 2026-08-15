# Security

> **Purpose:** the threat model, active controls, and the mandatory pre-live-trading checklist.
> **Audience:** implementers and security review. **Belongs here:** security posture. **Lives elsewhere:** auth mechanics (this doc summarizes; Better Auth config in src/server), deployment env handling (DEPLOYMENT.md).

## Authentication & sessions

Better Auth (OSS, self-hosted): email/password, scrypt hashing (no custom crypto), database sessions in our Postgres — HttpOnly, Secure, SameSite=Lax cookies; 30-day rolling, revocable server-side. Signup requires zxcvbn score ≥ 3. CSRF: Better Auth origin checks + SameSite; state-changing endpoints additionally verify the Origin header. Rate limits: 10/min on auth endpoints; 60/min per session on order placement. Password recovery: deferred pending MVP.md open decision #2. The rest of the app sees only `getSession()` — the provider-swap seam.

## Authorization

Single role (user). Every query is filtered by the session's account at the repository call site; cross-user access returns 404 (integration-tested). Resource ownership is checked server-side, never trusted from params.

## Application controls

- **Input:** Zod on every boundary (API bodies, env via `src/env.ts`, cron header).
- **Output:** React escaping; no `dangerouslySetInnerHTML` (single sanctioned exception: the constant theme-bootstrap script in `src/app/layout.tsx` — static string, no user input); security headers via next.config (nosniff, referrer-policy, frame-deny); CSP tightened in the hardening phase.
- **SQLi:** Drizzle parameterized queries; raw SQL only via the parameterized `sql` template — string-concatenated SQL is review-blocked.
- **SSRF:** outbound calls go only to pinned Alpaca base-URL constants; no user-supplied URLs are fetched.
- **Secrets:** env vars only; `.env.example` documents all; gitleaks in CI; pino redaction list (password, cookie, authorization, api keys); no secrets in client bundles (`process.env` only in src/env.ts; no `NEXT_PUBLIC_` secrets).
- **Dependencies:** lockfile committed; pnpm audit + Dependabot weekly.
- **Transport:** HTTPS everywhere (platform TLS), HSTS in hardening phase.

## Broker-integration specifics

- Alpaca sandbox keys are **firm-level secrets** in web/worker env only — never client-side, never in per-user rows.
- **Synthetic KYC only:** no real user PII is ever sent to the sandbox.
- The adapter pins the **sandbox** base URL; the production broker-api hostname appears nowhere in the codebase at MVP.
- `order_events.raw_payload` passes a redaction filter before persistence.
- Worker HTTP surface: `/healthz` + `/reconcile` (CRON_SECRET-guarded) only.

## Paper/live isolation (defense in depth, MVP-active)

1. `accounts.mode` DB CHECK allows only 'PAPER'.
2. The broker registry contains only DETERMINISTIC and ALPACA_PAPER kinds — no live adapter code exists.
3. ExecutionService asserts `broker.kind` is a paper kind (alert-level log on violation).
4. No live credentials exist in any environment.
5. Persistent "Paper trading — simulated money" UI badge.

## Mandatory before any live trading (not built at MVP; do not delete this list)

Separate deployment + environment for live · live credentials only there · per-account mode migration with explicit user opt-in + real KYC · independent kill-switch env (`LIVE_TRADING_ENABLED`) · MFA + re-auth for trades · per-order confirmations + anomaly limits · broker adapter contract tests + reconciliation jobs against the live venue · audited logging/retention · regulatory review. The `mode` CHECK is relaxed only by a deliberate, human-approved ADR + migration.
