import type { BrokerAccountRef, BrokerKindId } from "../accounts";
import type { Money, Px, Qty } from "../money";
import type { CanonicalBrokerEvent, OrderSide, OrderType, TimeInForce } from "../orders";

/**
 * The Broker port (ADR-005). Asynchronous-shaped: fills and lifecycle outcomes
 * arrive as CanonicalBrokerEvents through the subscription — NEVER as submit()
 * return values. Every implementation must pass the compliance suite
 * (tests/contract/broker-compliance.ts).
 */

export interface BrokerOrderRequest {
  /** Ledgerline order id — the venue-level idempotency key (client_order_id). */
  clientOrderId: string;
  brokerAccountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: Qty;
  limitPrice: Px | null;
  tif: TimeInForce;
  /** MVP: always false; in the contract so venue support can be adopted later. */
  extendedHours: boolean;
}

export interface SubmitResult {
  /** Venue-assigned order id (may equal clientOrderId on simple venues). */
  brokerOrderId: string;
  /** true when the venue reports this clientOrderId was already submitted (409-style). */
  duplicate: boolean;
}

export interface CancelResult {
  /** Cancel request accepted by the venue (outcome arrives as an event). */
  accepted: boolean;
  reason?: string;
}

export interface BrokerOrderSnapshot {
  clientOrderId: string;
  brokerOrderId: string;
  status: string; // vendor-string preserved for reconciliation diffs
  filledQty: Qty;
  events: CanonicalBrokerEvent[];
}

export interface BrokerAccountSnapshot {
  externalAccountId: string;
  cash: Money;
  positions: Array<{ symbol: string; qty: Qty }>;
}

export interface EventCursor {
  lastExternalEventId: string;
}

export interface Subscription {
  close(): void;
}

export interface ProvisionRequest {
  ledgerlineAccountId: string;
  startingCash: Money;
}

export interface Broker {
  readonly kind: BrokerKindId;
  provisionAccount(req: ProvisionRequest): Promise<BrokerAccountRef>;
  submit(req: BrokerOrderRequest): Promise<SubmitResult>;
  cancel(brokerAccountId: string, clientOrderId: string): Promise<CancelResult>;
  getOrderByClientId(
    brokerAccountId: string,
    clientOrderId: string,
  ): Promise<BrokerOrderSnapshot | null>;
  listOpenOrders(brokerAccountId: string): Promise<BrokerOrderSnapshot[]>;
  getAccountSnapshot(brokerAccountId: string): Promise<BrokerAccountSnapshot>;
  /**
   * Subscribe to canonical events. With a cursor, missed events replay first
   * (exactly-once is the CONSUMER's job via unique external ids — the stream
   * may deliver duplicates).
   */
  subscribe(
    cursor: EventCursor | null,
    onEvent: (event: CanonicalBrokerEvent) => Promise<void>,
  ): Subscription;
}
