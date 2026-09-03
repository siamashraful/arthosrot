import { and, eq, ilike, or, sql } from "drizzle-orm";
import type { Instrument, InstrumentsRepository } from "@/core/instruments";
import type { InstrumentSummary } from "@/core/market-data";
import { invariant, type TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type Row = typeof schema.instruments.$inferSelect;

function toInstrument(row: Row): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    status: row.status,
  };
}

export const instrumentsRepository: InstrumentsRepository = {
  async upsert(tx: TxHandle, summary: InstrumentSummary): Promise<Instrument> {
    const [row] = await asDb(tx)
      .insert(schema.instruments)
      .values({
        symbol: summary.symbol.toUpperCase(),
        name: summary.name,
        exchange: summary.exchange,
      })
      .onConflictDoUpdate({
        target: schema.instruments.symbol,
        set: {
          // Never downgrade good reference data to placeholders.
          name: sql`CASE WHEN excluded.name <> excluded.symbol THEN excluded.name ELSE ${schema.instruments.name} END`,
          exchange: sql`CASE WHEN excluded.exchange <> 'UNKNOWN' THEN excluded.exchange ELSE ${schema.instruments.exchange} END`,
          // A provider vouching for the symbol reactivates it — INACTIVE is
          // sync-owned state, never a one-way trap for quotable instruments.
          status: sql`'ACTIVE'`,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    invariant(row, "instrument upsert returned no row");
    return toInstrument(row);
  },

  async getBySymbol(tx: TxHandle, symbol: string): Promise<Instrument | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.instruments)
      .where(eq(schema.instruments.symbol, symbol.toUpperCase()));
    return row ? toInstrument(row) : null;
  },

  async search(tx: TxHandle, query: string, limit: number): Promise<Instrument[]> {
    // Rank: exact symbol, then symbol prefix, then name substring — a user
    // typing an exact ticker must see it first, not wherever the alphabet
    // lands it in 13k instruments. INACTIVE (delisted) symbols never surface.
    const upper = query.toUpperCase();
    const rows = await asDb(tx)
      .select()
      .from(schema.instruments)
      .where(
        and(
          eq(schema.instruments.status, "ACTIVE"),
          or(
            ilike(schema.instruments.symbol, `${query}%`),
            ilike(schema.instruments.name, `%${query}%`),
          ),
        ),
      )
      .orderBy(
        sql`(${schema.instruments.symbol} = ${upper}) DESC`,
        sql`(${schema.instruments.symbol} ILIKE ${`${query}%`}) DESC`,
        schema.instruments.symbol,
      )
      .limit(limit);
    return rows.map(toInstrument);
  },
};
