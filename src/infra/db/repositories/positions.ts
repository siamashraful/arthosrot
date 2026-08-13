import { and, eq, sql } from "drizzle-orm";
import { Basis, Qty } from "@/core/money";
import type { Position, PositionsRepository } from "@/core/portfolio";
import type { TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type Row = typeof schema.positions.$inferSelect;

function toPosition(row: Row): Position {
  return {
    accountId: row.accountId,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    qty: Qty.of(row.qty),
    costBasisTotal: Basis.fromString(row.costBasisTotal),
  };
}

export const positionsRepository: PositionsRepository = {
  async getForUpdate(tx: TxHandle, accountId: string, instrumentId: string) {
    const [row] = await asDb(tx)
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.accountId, accountId),
          eq(schema.positions.instrumentId, instrumentId),
        ),
      )
      .for("update");
    return row ? toPosition(row) : null;
  },

  async upsert(tx: TxHandle, position: Position): Promise<void> {
    await asDb(tx)
      .insert(schema.positions)
      .values({
        accountId: position.accountId,
        instrumentId: position.instrumentId,
        symbol: position.symbol,
        qty: position.qty.toBigInt(),
        costBasisTotal: position.costBasisTotal.toString(),
      })
      .onConflictDoUpdate({
        target: [schema.positions.accountId, schema.positions.instrumentId],
        set: {
          qty: position.qty.toBigInt(),
          costBasisTotal: position.costBasisTotal.toString(),
          updatedAt: sql`now()`,
        },
      });
  },

  async listForAccount(tx: TxHandle, accountId: string): Promise<Position[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.accountId, accountId))
      .orderBy(schema.positions.symbol);
    return rows.map(toPosition);
  },

  async getQty(tx: TxHandle, accountId: string, instrumentId: string): Promise<Qty> {
    const [row] = await asDb(tx)
      .select({ qty: schema.positions.qty })
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.accountId, accountId),
          eq(schema.positions.instrumentId, instrumentId),
        ),
      );
    return Qty.of(row?.qty ?? 0n);
  },
};
