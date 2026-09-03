# ADR-011 — Live-mode preview: client-side mode switch + funding port scaffold

**Status:** accepted (2026-09)

**Context:** The product's stated direction is real trading for beginners graduating from practice. The brand defines a three-signal paper/live mode system (BRAND.md §5) that was specified but never activated, and the eventual live build needs its UI surfaces and backend seams designed before real money is involved — not improvised under it. At the same time, the safety rails (CLAUDE.md: PAPER-only `accounts.mode` CHECK, paper-only broker kinds, no live code/hostnames/credentials) must not move.

**Decision:**

1. **Trading mode is a client-side presentation preference only** — `localStorage["trading-mode"]` + `data-mode="live"` on `<html>` (applied pre-hydration, same mechanism as the theme), toggled by a Settings switch whose live-entry confirmation names the mode in words. No server state, no schema change, no API change.
2. **Live mode is a visual PREVIEW**: live surfaces render live's own empty states ($0.00, no positions/orders/activity) and never render paper data — a paper fact re-badged as live is the one forbidden state. The persistent ribbon in live mode says "Live preview — real trading isn't available yet" (honesty overrides the spec'd final-state "Live — real money" label until trading is real).
3. **Deposit/withdraw exist as designed, non-functional sheets** (`FundingSheet`): the primary action is always disabled and no request is sent.
4. **`core/funding` defines the `FundingProvider` port** (initiateDeposit / initiateWithdrawal / listTransfers, transfer states, `FundingNotEnabledError`) — types only; no implementation, adapter, route, or env var.
5. **`WITHDRAWAL` joins the core `LedgerEntryType` union** (the DB enum already had it); no writer exists.
6. **ExecutionService gains the runtime paper-kind assertion** SECURITY.md control 3 already described.

**Rationale:** The mode distinction is a safety feature and must be designed while the stakes are zero. A client-only switch delivers the complete live UX (signals, empty states, funding flows) with literally no change to financial state or its guards, and the port types force the eventual implementation to meet a considered contract.

**Consequences:** The mode preference is per-device and resets with cleared storage — acceptable for a preview; real live access will be a server-side, per-account fact behind KYC (docs/LIVE_TRADING_TODO.md). Live surfaces must be kept honest: any new page that shows account data must add its live-mode gate.

**Revisit when:** building real live trading. This ADR does NOT authorize it: relaxing the `mode` CHECK, adding a live broker kind, or adding live credentials still requires its own human-approved ADR plus every control in SECURITY.md's pre-live checklist.
