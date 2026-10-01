import { and, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { NewPriceAlert, PriceAlert, PriceAlertsRepository } from "@/core/alerts";
import { Px } from "@/core/money";
import type { TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type Row = typeof schema.priceAlerts.$inferSelect;

const t = schema.priceAlerts;

function toAlert(row: Row): PriceAlert {
  return {
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    direction: row.direction,
    threshold: Px.fromString(row.threshold),
    state: row.state,
    createdAt: row.createdAt,
    triggeredAt: row.triggeredAt,
    triggerPrice: row.triggerPrice ? Px.fromString(row.triggerPrice) : null,
    triggerQuoteAt: row.triggerQuoteAt,
    readAt: row.readAt,
    canceledAt: row.canceledAt,
  };
}

/** price_alerts (ADR-016). Every state change is conditional on the current state. */
export const priceAlertsRepository = {
  async lockUser(tx: TxHandle, userId: string): Promise<void> {
    // Transaction-scoped advisory lock keyed by the user: serializes the cap
    // + duplicate check without touching another module's tables.
    await asDb(tx).execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`price_alerts:${userId}`}, 0))`,
    );
  },

  async countActive(tx: TxHandle, userId: string): Promise<number> {
    const [row] = await asDb(tx)
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.state, "ACTIVE")));
    return row?.n ?? 0;
  },

  async findActiveDuplicate(tx: TxHandle, input: NewPriceAlert): Promise<PriceAlert | null> {
    const [row] = await asDb(tx)
      .select()
      .from(t)
      .where(
        and(
          eq(t.userId, input.userId),
          eq(t.symbol, input.symbol),
          eq(t.direction, input.direction),
          // NUMERIC equality: "210.5" and "210.5000" are the same threshold
          eq(t.threshold, input.threshold.toString()),
          eq(t.state, "ACTIVE"),
        ),
      );
    return row ? toAlert(row) : null;
  },

  async insert(tx: TxHandle, input: NewPriceAlert): Promise<PriceAlert | null> {
    const rows = await asDb(tx)
      .insert(t)
      .values({
        userId: input.userId,
        symbol: input.symbol,
        direction: input.direction,
        threshold: input.threshold.toString(),
      })
      // the only unique constraint besides the uuid PK is the ACTIVE-terms index
      .onConflictDoNothing()
      .returning();
    return rows[0] ? toAlert(rows[0]) : null;
  },

  async getByIdForUpdate(tx: TxHandle, id: string): Promise<PriceAlert | null> {
    const [row] = await asDb(tx).select().from(t).where(eq(t.id, id)).for("update");
    return row ? toAlert(row) : null;
  },

  async listForUser(tx: TxHandle, userId: string, limit: number): Promise<PriceAlert[]> {
    const rows = await asDb(tx)
      .select()
      .from(t)
      .where(and(eq(t.userId, userId), ne(t.state, "CANCELED")))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(limit);
    return rows.map(toAlert);
  },

  async listActiveForUser(tx: TxHandle, userId: string): Promise<PriceAlert[]> {
    const rows = await asDb(tx)
      .select()
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.state, "ACTIVE")));
    return rows.map(toAlert);
  },

  async listActiveSymbols(tx: TxHandle): Promise<string[]> {
    const rows = await asDb(tx)
      .selectDistinct({ symbol: t.symbol })
      .from(t)
      .where(eq(t.state, "ACTIVE"))
      .orderBy(t.symbol);
    return rows.map((r) => r.symbol);
  },

  async listActiveForSymbols(tx: TxHandle, symbols: readonly string[]): Promise<PriceAlert[]> {
    if (symbols.length === 0) return [];
    const rows = await asDb(tx)
      .select()
      .from(t)
      .where(and(eq(t.state, "ACTIVE"), inArray(t.symbol, [...symbols])));
    return rows.map(toAlert);
  },

  async markTriggered(
    tx: TxHandle,
    id: string,
    facts: { price: Px; quoteAt: Date; at: Date },
  ): Promise<PriceAlert | null> {
    // Conditional: a concurrent evaluation blocks on the row, then re-checks
    // state = 'ACTIVE' after the winner commits and matches nothing.
    const rows = await asDb(tx)
      .update(t)
      .set({
        state: "TRIGGERED",
        triggeredAt: facts.at,
        triggerPrice: facts.price.toString(),
        triggerQuoteAt: facts.quoteAt,
      })
      .where(and(eq(t.id, id), eq(t.state, "ACTIVE")))
      .returning();
    return rows[0] ? toAlert(rows[0]) : null;
  },

  async cancel(tx: TxHandle, id: string, at: Date): Promise<PriceAlert | null> {
    const rows = await asDb(tx)
      .update(t)
      .set({ state: "CANCELED", canceledAt: at })
      .where(and(eq(t.id, id), inArray(t.state, ["ACTIVE", "TRIGGERED"])))
      .returning();
    return rows[0] ? toAlert(rows[0]) : null;
  },

  async markRead(tx: TxHandle, userId: string, at: Date, ids?: readonly string[]): Promise<number> {
    if (ids && ids.length === 0) return 0;
    const rows = await asDb(tx)
      .update(t)
      .set({ readAt: at })
      .where(
        and(
          eq(t.userId, userId),
          eq(t.state, "TRIGGERED"),
          isNull(t.readAt),
          ...(ids ? [inArray(t.id, [...ids])] : []),
        ),
      )
      .returning({ id: t.id });
    return rows.length;
  },

  async countUnread(tx: TxHandle, userId: string): Promise<number> {
    const [row] = await asDb(tx)
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.state, "TRIGGERED"), isNull(t.readAt)));
    return row?.n ?? 0;
  },
} satisfies PriceAlertsRepository & Record<string, unknown>;
