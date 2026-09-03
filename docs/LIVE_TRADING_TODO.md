# Live trading — remaining work

> **Purpose:** the task list between today's live-mode preview (ADR-011) and real trading with real money. Nothing here is started; everything here is required.
> **Audience:** developers. **Belongs here:** what must be built and in what order. **Lives elsewhere:** the mandatory security controls (architecture/SECURITY.md — that list gates everything below), the mode system's visual law (design/brand/BRAND.md §5).

The preview shipped the UX and the seams: the mode switch, the live surfaces and their empty states, the `FundingProvider` port (`src/core/funding`), `WITHDRAWAL` in the core ledger union, and the paper-kind guard in ExecutionService. The work below turns the preview real. **Order matters — nothing past item 1 may begin before it.**

1. **The live-trading ADR.** A human-approved ADR authorizing live trading, per CLAUDE.md's safety rules. It supersedes ADR-011's scaffold-only scope and adopts SECURITY.md's "Mandatory before any live trading" list as acceptance criteria (separate deployment, `LIVE_TRADING_ENABLED` kill switch, MFA/re-auth, per-order confirmations, audited logging, regulatory review).
2. **Account modes for real.** Migration relaxing the `accounts.mode` CHECK (`-- destructive:` header + human sign-off) to admit `LIVE`; live accounts are NEW accounts (a paper account never converts in place); per-user server-side mode/entitlement replaces the localStorage preference; `/api/v1/me` reports which modes the user holds.
3. **KYC & identity.** Real KYC through the broker's account-opening flow (the sandbox's synthetic-data rule inverts: live requires real, verified PII with its own retention/protection rules), disclosures and agreements, suitability where required.
4. **Live broker adapter.** `ALPACA_LIVE` (or chosen venue) added to `BrokerKindId` behind the ADR; live credentials only in the live deployment; the adapter passes the full Broker compliance suite plus live-venue reconciliation jobs; ExecutionService's paper-kind guard becomes mode-aware rather than deleted.
5. **Funding for real.** Implement `FundingProvider` against the venue's transfer API (ACH first): linked bank accounts (Plaid or venue-native), transfer initiation with per-day limits, asynchronous settlement events posting `DEPOSIT`/`WITHDRAWAL` ledger entries idempotently by `externalTransferId` — funding events, like broker events, are the only writers. Withdrawals need available-balance math (settled cash minus reservations) computed inside the account lock.
6. **Net-worth math learns withdrawals.** `equity-series.ts` netDeposits becomes deposits − withdrawals; Activity renders WITHDRAWAL rows (label already present).
7. **FundingSheet goes live.** Enable the sheets behind the server-side entitlement: real funding-source picker, amount validation server-side in Money, pending/settled transfer states in Activity, failure states designed (rail rejections, limits, reversals).
8. **Order flow confirmations.** Real-order confirmation copy names the mode in words ("This places a real order with real money" — BRAND.md §5), per-order anomaly limits, MFA re-auth for trades per SECURITY.md.
9. **Market data entitlements.** Live display may need consolidated-tape licensing review; freshness rules stay (never a price without freshness context).
10. **Operations.** Monitoring/alerting on the live pipeline (fills lag, reconciliation diffs, funding failures), incident runbook, audited log retention, support path for money-movement disputes.

Until item 1 exists, the preview stays a preview: any PR that adds live-broker code, hostnames, credentials, or relaxes the mode CHECK without that ADR is rejected on review.
