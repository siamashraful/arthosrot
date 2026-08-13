import { eq, ilike, or, sql } from "drizzle-orm";
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
    const rows = await asDb(tx)
      .select()
      .from(schema.instruments)
      .where(
        or(
          ilike(schema.instruments.symbol, `${query}%`),
          ilike(schema.instruments.name, `%${query}%`),
        ),
      )
      .orderBy(schema.instruments.symbol)
      .limit(limit);
    return rows.map(toInstrument);
  },
};
