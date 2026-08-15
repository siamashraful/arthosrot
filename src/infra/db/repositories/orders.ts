import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  NewOrderInput,
  Order,
  OrderEventRecord,
  OrdersRepository,
  OrderState,
} from "@/core/orders";
import { Money, Px, Qty } from "@/core/money";
import { invariant, type TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

const OPEN_STATES: OrderState[] = [
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
];

type Row = typeof schema.orders.$inferSelect;

function toOrder(row: Row): Order {
  return {
    id: row.id,
    accountId: row.accountId,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    tif: row.tif,
    qty: Qty.of(row.qty),
    limitPrice: row.limitPrice ? Px.fromString(row.limitPrice) : null,
    state: row.state,
    filledQty: Qty.of(row.filledQty),
    reservedCash: Money.fromString(row.reservedCash),
    rejectReason: row.rejectReason,
    needsAttention: row.needsAttention,
    idempotencyKey: row.idempotencyKey,
    broker: row.broker,
    brokerOrderId: row.brokerOrderId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const ordersRepository: OrdersRepository = {
  async insert(tx, input: NewOrderInput & { reservedCash: Money }): Promise<Order | null> {
    const rows = await asDb(tx)
      .insert(schema.orders)
      .values({
        accountId: input.account.id,
        instrumentId: input.instrument.id,
        symbol: input.instrument.symbol,
        side: input.side,
        type: input.type,
        tif: "DAY",
        qty: input.qty.toBigInt(),
        limitPrice: input.limitPrice?.toString() ?? null,
        reservedCash: input.reservedCash.toString(),
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({
        target: [schema.orders.accountId, schema.orders.idempotencyKey],
      })
      .returning();
    return rows[0] ? toOrder(rows[0]) : null;
  },

  async getById(tx, id): Promise<Order | null> {
    const [row] = await asDb(tx).select().from(schema.orders).where(eq(schema.orders.id, id));
    return row ? toOrder(row) : null;
  },

  async getByIdForUpdate(tx, id): Promise<Order | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .for("update");
    return row ? toOrder(row) : null;
  },

  async getByIdempotencyKey(tx, accountId, key): Promise<Order | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.accountId, accountId), eq(schema.orders.idempotencyKey, key)));
    return row ? toOrder(row) : null;
  },

  async listForAccount(tx, accountId, openOnly, limit): Promise<Order[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.orders)
      .where(
        openOnly
          ? and(eq(schema.orders.accountId, accountId), inArray(schema.orders.state, OPEN_STATES))
          : eq(schema.orders.accountId, accountId),
      )
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit);
    return rows.map(toOrder);
  },

  async update(tx, id, patch): Promise<void> {
    await asDb(tx)
      .update(schema.orders)
      .set({
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.filledQty !== undefined ? { filledQty: patch.filledQty.toBigInt() } : {}),
        ...(patch.reservedCash !== undefined
          ? { reservedCash: patch.reservedCash.toString() }
          : {}),
        ...(patch.broker !== undefined && patch.broker !== null ? { broker: patch.broker } : {}),
        ...(patch.brokerOrderId !== undefined ? { brokerOrderId: patch.brokerOrderId } : {}),
        ...(patch.rejectReason !== undefined ? { rejectReason: patch.rejectReason } : {}),
        ...(patch.needsAttention !== undefined ? { needsAttention: patch.needsAttention } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.orders.id, id));
  },

  async sumOpenBuyReservations(tx, accountId): Promise<Money> {
    const [row] = await asDb(tx)
      .select({
        total: sql<string>`coalesce(sum(${schema.orders.reservedCash}), 0)::text`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.accountId, accountId),
          eq(schema.orders.side, "BUY"),
          inArray(schema.orders.state, OPEN_STATES),
        ),
      );
    const raw = row?.total ?? "0";
    return Money.fromString(raw.includes(".") ? raw : `${raw}.00`);
  },

  async sumOpenSellRemainders(tx, accountId, instrumentId): Promise<Qty> {
    const [row] = await asDb(tx)
      .select({
        total: sql<string>`coalesce(sum(${schema.orders.qty} - ${schema.orders.filledQty}), 0)::text`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.accountId, accountId),
          eq(schema.orders.instrumentId, instrumentId),
          eq(schema.orders.side, "SELL"),
          inArray(schema.orders.state, OPEN_STATES),
        ),
      );
    return Qty.of(row?.total ?? "0");
  },

  async insertEvent(tx, event: OrderEventRecord): Promise<boolean> {
    const rows = await asDb(tx)
      .insert(schema.orderEvents)
      .values({
        orderId: event.orderId,
        canonicalEventType: event.canonicalEventType,
        fromState: event.fromState,
        toState: event.toState,
        source: event.source,
        broker: event.broker,
        externalEventId: event.externalEventId,
        occurredAt: event.occurredAt,
        rawPayload: event.rawPayload ?? null,
      })
      .onConflictDoNothing({
        target: [schema.orderEvents.broker, schema.orderEvents.externalEventId],
      })
      .returning({ id: schema.orderEvents.id });
    return rows.length > 0;
  },

  async eventExists(tx, broker, externalEventId): Promise<boolean> {
    if (!broker) return false;
    const rows = await asDb(tx)
      .select({ id: schema.orderEvents.id })
      .from(schema.orderEvents)
      .where(
        and(
          eq(schema.orderEvents.broker, broker),
          eq(schema.orderEvents.externalEventId, externalEventId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },

  async listEvents(tx, orderId): Promise<OrderEventRecord[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.orderEvents)
      .where(eq(schema.orderEvents.orderId, orderId))
      .orderBy(schema.orderEvents.createdAt);
    return rows.map((row) => ({
      orderId: row.orderId,
      canonicalEventType: row.canonicalEventType as OrderEventRecord["canonicalEventType"],
      fromState: row.fromState,
      toState: row.toState,
      source: row.source,
      broker: row.broker,
      externalEventId: row.externalEventId,
      occurredAt: row.occurredAt,
      rawPayload: row.rawPayload ?? undefined,
    }));
  },
};

/** Minimal position-quantity reader for sellable checks (full store in portfolio). */
export async function getPositionQty(
  tx: TxHandle,
  accountId: string,
  instrumentId: string,
): Promise<Qty> {
  const [row] = await asDb(tx)
    .select({ qty: schema.positions.qty })
    .from(schema.positions)
    .where(
      and(
        eq(schema.positions.accountId, accountId),
        eq(schema.positions.instrumentId, instrumentId),
      ),
    );
  invariant(row === undefined || row.qty >= 0n, "negative position quantity");
  return Qty.of(row?.qty ?? 0n);
}
