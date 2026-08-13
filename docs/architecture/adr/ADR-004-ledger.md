# ADR-004 — Single-entry immutable ledger as authoritative history; cash as cached projection

**Status:** accepted (2026-08)

**Context:** Every cash movement must be auditable and reconstructible; execution is external, so imported facts must never double-post.

**Options:** (a) mutable balance column only; (b) single-entry append-only ledger; (c) full double-entry accounting.

**Decision:** (b). `ledger_entries` is the authoritative Ledgerline record of cash movements (signed 2dp amounts, typed, cause-referenced). `accounts.cash_balance` is a cached projection with `projected_cash = Σ(entries)` asserted by reconciliation (invariant 6). Append-only is structural (no UPDATE/DELETE grants + trigger); corrections are new ADJUSTMENT entries. Every execution-derived entry references a unique fill (`execution_id`-unique), making duplicate posting impossible.

**Rationale:** A bare balance column is unauditable. Double-entry's payoff (multi-account balancing) buys nothing with one cash asset per account, and costs schema and cognition. The migration path is preserved: adding a `journal_id` + second leg upgrades history without rewriting it.

**Consequences:** the opening DEPOSIT is itself an entry (counted once); reserved entry types (WITHDRAWAL, DIVIDEND, CORPORATE_ACTION, RECONCILIATION_ADJUSTMENT) document the future without building it.

**Revisit when:** inter-account transfers, dividends, or real-money accounting requirements arrive → evaluate double-entry migration.
