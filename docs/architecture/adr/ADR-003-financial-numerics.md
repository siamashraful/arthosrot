# ADR-003 — Financial numeric model: decimal.js + NUMERIC + HALF_EVEN + strings on the wire

**Status:** accepted (2026-08)

**Context:** JavaScript floats cannot represent money. Every financial value needs exact arithmetic, one rounding policy, and safe serialization.

**Options:** (a) integer cents everywhere; (b) decimal.js behind branded value objects; (c) big.js/dinero.

**Decision:** (b) decimal.js wrapped in branded `Money` (USD, 2dp), `Px` (4dp), `Qty` (integer shares) in `core/money`; Postgres NUMERIC(18,2)/(18,4)/BIGINT (+ NUMERIC(20,4) cost basis); ROUND_HALF_EVEN applied **once per derivation**; JSON carries money/prices as strings; raw `number` arithmetic on financial values is lint-banned in core.

**Rationale:** Integer cents break down for 4dp prices and average-cost math. decimal.js is mature and configurable; branded wrappers make illegal arithmetic unrepresentable at the type level rather than by convention. Strings on the wire match the venue's own convention (Alpaca serializes numbers as strings), removing a whole class of parse bugs — vendor strings parse to Decimal at the adapter boundary.

**Consequences:** all formatting flows through `lib/format.ts`; P&L uses the average-cost method with exact-remainder allocation on final sells (FINANCIAL_INVARIANTS.md); property tests bound rounding drift.

**Revisit when:** multi-currency or fractional shares arrive (types already parameterize; precision table would extend).
