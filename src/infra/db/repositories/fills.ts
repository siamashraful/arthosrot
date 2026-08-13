import { eq } from "drizzle-orm";
import type { FillRecord, FillsRepository } from "@/core/execution";
import { Money, Qty } from "@/core/money";
import type { FillForReplay, FillsReplaySource } from "@/core/portfolio";
import type { TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

export const fillsRepository: FillsRepository = {
  async insert(tx: TxHandle, fill: FillRecord): Promise<boolean> {
    const rows = await asDb(tx)
      .insert(schema.fills)
      .values({
        orderId: fill.orderId,
        qty: fill.qty.toBigInt(),
        price: fill.price,
        fee: fill.fee,
        notional: fill.notional,
        broker: fill.broker,
        executionId: fill.executionId,
        occurredAt: fill.occurredAt,
      })
      .onConflictDoNothing({ target: [schema.fills.broker, schema.fills.executionId] })
      .returning({ id: schema.fills.id });
    return rows.length > 0;
  },

  async listForOrder(tx: TxHandle, orderId: string): Promise<FillRecord[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, orderId))
      .orderBy(schema.fills.occurredAt);
    return rows.map((row) => ({
      orderId: row.orderId,
      qty: Qty.of(row.qty),
      price: row.price,
      fee: row.fee,
      notional: row.notional,
      broker: row.broker,
      executionId: row.executionId,
      occurredAt: row.occurredAt,
    }));
  },
};

/** Chronological fills joined with order side/symbol — realized-P&L replay source. */
export const fillsReplaySource: FillsReplaySource = {
  async listForAccountChronological(tx: TxHandle, accountId: string): Promise<FillForReplay[]> {
    const rows = await asDb(tx)
      .select({
        instrumentId: schema.orders.instrumentId,
        symbol: schema.orders.symbol,
        side: schema.orders.side,
        qty: schema.fills.qty,
        notional: schema.fills.notional,
        fee: schema.fills.fee,
        occurredAt: schema.fills.occurredAt,
        createdAt: schema.fills.createdAt,
      })
      .from(schema.fills)
      .innerJoin(schema.orders, eq(schema.fills.orderId, schema.orders.id))
      .where(eq(schema.orders.accountId, accountId))
      .orderBy(schema.fills.occurredAt, schema.fills.createdAt);
    return rows.map((row) => ({
      instrumentId: row.instrumentId,
      symbol: row.symbol,
      side: row.side,
      qty: Qty.of(row.qty),
      notional: Money.fromString(row.notional),
      fee: Money.fromString(row.fee),
      occurredAt: row.occurredAt,
    }));
  },
};
