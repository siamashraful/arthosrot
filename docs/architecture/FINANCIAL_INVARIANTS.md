# Financial invariants

> **Purpose:** the numbered, canonical list of invariants that must always hold, each mapped to its automated test.
> **Audience:** implementers, reviewers, and adversarial reviews. **Belongs here:** the invariants and their test map. **Lives elsewhere:** mechanisms (EXECUTION.md, DATA_MODEL.md).

Every invariant ships with a test that _attempts to violate it_. The test-file column is filled in as phases land; an unmapped invariant in a shipped phase is a review-blocking gap.

| #   | Invariant                                                                                                                                    | Enforcement                              | Test          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| 1   | Σ(fill.qty) per order ≤ order.qty; each fill.qty > 0                                                                                         | DB CHECK + code                          | _(phase 7)_   |
| 2   | No transition out of a terminal order state; all transitions via `applyTransition`                                                           | Exhaustive unit tests                    | _(phase 5)_   |
| 3   | Position qty ≥ 0 (long-only)                                                                                                                 | DB CHECK                                 | _(phase 7)_   |
| 4   | Sell placement ≤ sellable qty (position − open-sell remainders), under lock                                                                  | Locked check                             | _(phase 5)_   |
| 5   | Buy placement ≤ buying power (cash projection − buy reservations), under lock                                                                | Locked check                             | _(phase 5)_   |
| 6   | `accounts.cash_balance` = Σ(ledger entries); the opening DEPOSIT is itself an entry, counted once. Drift ⇒ DRIFT_DETECTED + error log        | Reconciliation assertion                 | _(phase 3)_   |
| 7   | Every fill ⇒ exactly one fills row + one TRADE ledger entry + one position delta, atomically                                                 | Single transaction; fault-injection test | _(phase 7)_   |
| 8   | `ledger_entries`, `fills`, `order_events` are append-only                                                                                    | Role grants + trigger                    | _(phase 3)_   |
| 9   | UNIQUE(account_id, idempotency_key) on orders; unique client_order_id at the venue (409 handled)                                             | Unique index + adapter                   | _(phase 5/8)_ |
| 10  | Unique external ids: order_events.external_event_id, fills.execution_id (per broker). Replaying any stream/reconciliation history is a no-op | Unique indexes + upsert-skip             | _(phase 7)_   |
| 11  | Reservations derive deterministically from open orders per the formulas below; released exactly on terminal/fill events                      | Property + scenario tests                | _(phase 5/7)_ |
| 12  | Valuations carry `asOf`; realized/unrealized P&L separately derivable and mutually consistent with ledger + market data                      | Property test                            | _(phase 10)_  |
| 13  | Fill price/qty/timestamp immutable once recorded; never derived from market data                                                             | No write path exists; asserted           | _(phase 7)_   |
| 14  | Reset archives — never deletes — history                                                                                                     | Archive flow; test                       | _(phase 10)_  |
| 15  | The same canonical event applied twice produces one financial effect                                                                         | Idempotent apply path                    | _(phase 7/9)_ |

## Reservation formulas (normative)

- **LIMIT BUY:** `reserve = limitPrice × remainingQty + estFees`
- **MARKET BUY:** `reserve = refPrice × qty × (1 + MARKET_BUY_BUFFER)`; `refPrice = ask ?? last`; buffer default 2.5% (env `MARKET_BUY_BUFFER`). If a fill exceeds the reserve anyway: the fill posts (execution facts are immutable), the cash projection may briefly go negative, reconciliation flags DRIFT_DETECTED. Deliberately **no** `cash ≥ 0` DB CHECK.
- **Release:** full remaining on CANCELLED / EXPIRED / REJECTED / SUBMIT_FAILED; recomputed from remaining qty on each fill, trued-up to actual notional.
- **Buying power** = cash projection − Σ active buy reservations. Recomputed inside the placement lock; never cached.
- **SELL:** `sellable = position.qty − Σ remainingQty(open sells)`. Worked case: position 100, open SELL LIMIT 70, partial fill 20 ⇒ position 80, remainder 50 reserved, sellable 30.
- **Broker disagreement:** broker wins (REJECTED), reservation released, discrepancy logged with both computations.

## Arithmetic rules

decimal.js behind branded `Money` (USD, 2dp) / `Px` (4dp) / `Qty` (integer) — raw `number` arithmetic on financial values is lint-banned in core. ROUND_HALF_EVEN, applied **once per derivation**: notional = round(price × qty, 2) at fill time; fees rounded at computation; P&L computed from stored rounded values. Average-cost method: sell allocates basis = avgCost × soldQty (2dp); the final sell allocates the exact remaining basis so Σ never drifts. JSON carries money/prices as strings (matches the venue's numbers-as-strings convention); vendor decimal strings parse to Decimal at the adapter boundary.

## Display derivations

- **Chart-rendering boundary:** converting a decimal string to a JS number is
  permitted ONLY at the final hand-off to a canvas chart library (which
  demands numbers), and only for display — never for arithmetic, comparison,
  or anything that feeds back into state. All series math (equity curve,
  deltas, percentages) happens in decimal inside `core` first
  (`core/portfolio/equity-series.ts`, `core/money percentChange`).
- **Series honesty:** the net-worth series fails whole
  (`ProviderUnavailableError`) when any held symbol cannot be priced at a
  grid point. A net worth silently missing one holding is fabricated data —
  worse than no chart. The series covers the ACTIVE account only; resets
  start the curve fresh (archived history stays on Activity — invariant 14).
