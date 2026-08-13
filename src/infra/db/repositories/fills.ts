import { eq } from "drizzle-orm";
import type { FillRecord, FillsRepository } from "@/core/execution";
import { Qty } from "@/core/money";
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
