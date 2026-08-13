# Execution architecture

> **Purpose:** the definitive reference for the Broker port, canonical events, order state machine, reservations, idempotency, concurrency, and reconciliation.
> **Audience:** anyone touching orders/execution/reconciliation. **Belongs here:** execution semantics. **Lives elsewhere:** schema (DATA_MODEL.md), invariants (FINANCIAL_INVARIANTS.md), vendor specifics (INTEGRATIONS.md).

## Broker port

```ts
interface Broker {
  readonly kind: "DETERMINISTIC" | "ALPACA_PAPER"; // live kinds post-MVP
  provisionAccount(req: ProvisionRequest): Promise<BrokerAccountRef>; // create + fund venue account
  submit(req: BrokerOrderRequest): Promise<SubmitResult>; // req carries clientOrderId (= Ledgerline order id)
  cancel(ref: BrokerOrderRef): Promise<CancelResult>;
  getOrder(ref: BrokerOrderRef): Promise<BrokerOrderSnapshot>;
  listOpenOrders(acct: BrokerAccountRef): Promise<BrokerOrderSnapshot[]>;
  getAccountSnapshot(acct: BrokerAccountRef): Promise<BrokerAccountSnapshot>; // reconciliation reference only
  subscribe(
    cursor: EventCursor | null,
    onEvent: (e: CanonicalBrokerEvent) => Promise<void>,
  ): Subscription;
}
```

Both implementations (AlpacaPaperBroker, DeterministicPaperBroker) must pass the same **Broker compliance suite** (tests/contract). The Broker and MarketDataProvider ports are independent — adapters share nothing beyond an optional low-level credential helper, so `AlpacaPaperBroker + AnyMarketData` and `FutureBroker + AlpacaMarketData` both compose.

## Canonical broker events

`ORDER_ACKNOWLEDGED`, `ORDER_ACCEPTED`, `ORDER_PARTIALLY_FILLED`, `ORDER_FILLED`, `ORDER_CANCEL_PENDING`, `ORDER_CANCELLED`, `ORDER_REJECTED`, `ORDER_EXPIRED`, `ORDER_REPLACED` (reserved), `UNKNOWN_VENDOR_STATUS`.

Each event carries `{broker, brokerAccountId, brokerOrderId, clientOrderId, externalEventId, executionId?, fillQty?, fillPrice?, fee?, occurredAt, receivedAt, raw}`. A partial fill is an `ORDER_PARTIALLY_FILLED` event with its own venue `executionId`; multiple fills are multiple events.

**Unknown vendor statuses:** translate to `UNKNOWN_VENDOR_STATUS` → the event is persisted to `order_events` (audit), **no state transition occurs**, the order is flagged `needs_attention`, reconciliation status → ERROR, error-level log. A later known event or reconciliation snapshot resolves it. Domain logic uses normalized fields only — never vendor JSON (`raw_payload` is audit/debugging only, redacted).

## Order state machine

| State (display)                     | Exact semantics                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| PENDING_SUBMISSION (Pending)        | Row committed locally with reservation; broker submission not yet confirmed        |
| ACKNOWLEDGED (Open)                 | Venue confirmed receipt (e.g., Alpaca `pending_new`)                               |
| ACCEPTED (Open)                     | Working at venue (`new`/`accepted`)                                                |
| PARTIALLY_FILLED (Partially filled) | ≥1 fill applied, remainder working                                                 |
| FILLED (Filled)                     | Terminal; cumulative fills = qty                                                   |
| CANCEL_PENDING (Cancelling)         | Cancel requested, awaiting venue confirmation                                      |
| CANCELLED (Cancelled)               | Terminal; remainder cancelled (prior fills stand)                                  |
| REJECTED (Rejected)                 | Terminal; **venue** rejected an order that entered the execution lifecycle         |
| EXPIRED (Expired)                   | Terminal; venue expired the DAY remainder                                          |
| SUBMIT_FAILED (Failed to submit)    | Terminal; delivery failed AND reconciliation confirmed the venue never received it |

**Rejection taxonomy:** request/domain validation failures (qty ≤ 0, bad symbol, missing/invalid limit price, precision, sell > sellable, buy > buying power) are 422 errors — **no order row is created**. REJECTED means the venue rejected it. SUBMIT_FAILED means transport failure. Never overloaded.

Transitions (via `applyTransition(order, canonicalEvent)` only; sources: B=broker event, L=local, R=reconciliation-synthesized):

| From \ To          | ACK                                                                                                                     | ACCEPTED | PART_FILLED        | FILLED   | CANCEL_PEND | CANCELLED     | REJECTED | EXPIRED       | SUBMIT_FAILED |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------------------ | -------- | ----------- | ------------- | -------- | ------------- | ------------- |
| PENDING_SUBMISSION | B                                                                                                                       | B/R      | B/R¹               | B/R¹     | —           | —             | B        | —             | L/R²          |
| ACKNOWLEDGED       | —                                                                                                                       | B        | B¹                 | B¹       | L           | B             | B        | B             | —             |
| ACCEPTED           | —                                                                                                                       | —        | B                  | B        | L           | B             | B        | B             | —             |
| PARTIALLY_FILLED   | —                                                                                                                       | —        | B (more fills)     | B        | L           | B (remainder) | —        | B (remainder) | —             |
| CANCEL_PENDING     | —                                                                                                                       | —        | B (race: fill won) | B (race) | —           | B             | —        | B             | —             |
| terminal           | **no exits** — enforced in `applyTransition`, exhaustively tested (no DB trigger; DB keeps structural constraints only) |          |                    |          |             |               |          |               |               |

¹ **Out-of-order tolerance:** a fill arriving before an ack is legal — ExecutionService synthesizes the implied ACKNOWLEDGED/ACCEPTED transitions first (recorded in `order_events` with `source='inferred'`), then applies the fill. Converges to broker truth without corrupting audit history.
² SUBMIT_FAILED only after retries **and** a reconciliation check proves the venue has no such order; if the venue does have it, its real state is imported instead. A crash between local commit and submit heals the same way.

Every transition is audit-logged to `order_events`. Cancellation of a partially filled order cancels only the remainder.

## Reservations

- **LIMIT BUY:** `reserve = limitPrice × remainingQty + estFees`.
- **MARKET BUY:** `reserve = refPrice × qty × (1 + MARKET_BUY_BUFFER)`, `refPrice = ask ?? last`, buffer default 2.5%. If a fill still exceeds the reserve, the fill posts anyway (execution facts are immutable), cash projection may briefly dip negative, and reconciliation flags DRIFT_DETECTED — there is deliberately **no** `cash ≥ 0` DB CHECK that could reject a real fill.
- **Release:** full remaining on CANCELLED/EXPIRED/REJECTED/SUBMIT_FAILED; on each fill recomputed from the new remaining qty and trued-up to actual notional.
- **Buying power** = cash projection − Σ active buy reservations; recomputed inside the placement lock, never cached.
- **SELL share reservation:** `sellable = position.qty − Σ remainingQty(open sells)`; a sell exceeding sellable is a validation error (no order created). Worked case: position 100, open SELL LIMIT 70, partial fill 20 ⇒ position 80, remainder 50 reserved, sellable 30.
- **Broker disagreement** (venue rejects for buying power we thought sufficient): broker wins → REJECTED, reservation released, discrepancy logged with both computations.

## Idempotency chain

1. **Client → API:** UUIDv4 `idempotencyKey` per ticket; `UNIQUE(account_id, idempotency_key)`; insert-first, conflict returns the original order (200).
2. **API → venue:** `client_order_id` = Ledgerline order UUID; the venue rejects duplicates (409) → adapter fetches the existing venue order by client id and continues.
3. **Venue → Ledgerline:** unique `external_event_id` (ULID) and `execution_id` indexes make event application replay-safe — the same fill via SSE and again via REST reconciliation produces one financial effect.
4. **Cancel:** naturally idempotent.

## Concurrency

Postgres row locks at READ COMMITTED; lock order fixed **account → order → position**.

- **Placement tx:** `SELECT … FOR UPDATE` account → compute buying power/sellable from locked state → insert PENDING_SUBMISSION → commit → submit outside the lock.
- **Event application tx (worker):** lock account → load order `FOR UPDATE` → `applyTransition` (with out-of-order synthesis) → insert order_event (+fill) — unique violation ⇒ already applied ⇒ commit no-op — → update order state/filled_qty → upsert position → insert ledger entry → update cash projection.
- **Cancel vs fill race:** CANCEL_PENDING locally; the venue decides; a vendor `canceled` after FILLED is rejected by the machine, logged, audit row kept.
- **Worker:** single SSE consumer, events applied serially per account; reconciliation shares the same idempotent apply path so overlap is safe.

## Reconciliation engine

Triggers: worker startup · SSE reconnect · schedule (GH Actions → `POST /reconcile`, market hours ~10 min) · on demand.

Process per broker-backed account: list local non-terminal orders → `getOrder`/`listOpenOrders` diff → fetch missing executions → synthesize canonical events → idempotent apply → compare cash/position snapshots → structured result log `{accountsChecked, ordersRepaired, fillsImported, driftDetected[], durationMs}` → update `broker_accounts.reconciliation_status` (HEALTHY / STALE / RECONCILING / DRIFT_DETECTED / ERROR) + `last_reconciled_at` / `last_stream_event_at`.

Rules: discover missed fills; repair stale order states through idempotent event processing; never double-apply financial effects; never blindly overwrite from snapshots; log discrepancies; preserve audit history.

## Testing contract

- Compliance suite (both brokers): submit market/limit, ack sequences, rejection, cancel, fill, partial fill, multiple fills, DAY expiration, duplicate event delivery, duplicate client_order_id, unknown status policy, submit timeout paths, reconnect with cursor replay, reconciliation import.
- Scenario suite: disconnect→fill→reconnect (exactly-once import); SSE+REST duplicate (one effect); fill-before-ack; REST says FILLED while local shows ACCEPTED (converge via inferred events); crash between commit and submit.
- `tests/external/` runs the real sandbox lifecycle (marketable limit fill, non-marketable place+cancel, id mapping, reconciliation) — manual/scheduled only, **never CI**.
