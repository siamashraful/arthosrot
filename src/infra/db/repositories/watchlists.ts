import { and, eq } from "drizzle-orm";
import { invariant, type TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

export interface WatchlistItemRow {
  id: string;
  symbol: string;
  name: string;
  sortOrder: number;
}

export const watchlistsRepository = {
  async getOrCreateForUser(tx: TxHandle, userId: string): Promise<string> {
    const db = asDb(tx);
    const [existing] = await db
      .select({ id: schema.watchlists.id })
      .from(schema.watchlists)
      .where(eq(schema.watchlists.userId, userId));
    if (existing) return existing.id;
    const [created] = await db
      .insert(schema.watchlists)
      .values({ userId })
      .onConflictDoNothing({ target: schema.watchlists.userId })
      .returning({ id: schema.watchlists.id });
    if (created) return created.id;
    const [raced] = await db
      .select({ id: schema.watchlists.id })
      .from(schema.watchlists)
      .where(eq(schema.watchlists.userId, userId));
    invariant(raced, "watchlist create race lost without a row");
    return raced.id;
  },

  async list(tx: TxHandle, watchlistId: string): Promise<WatchlistItemRow[]> {
    const rows = await asDb(tx)
      .select({
        id: schema.watchlistItems.id,
        sortOrder: schema.watchlistItems.sortOrder,
        symbol: schema.instruments.symbol,
        name: schema.instruments.name,
      })
      .from(schema.watchlistItems)
      .innerJoin(schema.instruments, eq(schema.watchlistItems.instrumentId, schema.instruments.id))
      .where(eq(schema.watchlistItems.watchlistId, watchlistId))
      .orderBy(schema.watchlistItems.sortOrder, schema.instruments.symbol);
    return rows;
  },

  async add(tx: TxHandle, watchlistId: string, instrumentId: string): Promise<void> {
    await asDb(tx)
      .insert(schema.watchlistItems)
      .values({ watchlistId, instrumentId })
      .onConflictDoNothing({
        target: [schema.watchlistItems.watchlistId, schema.watchlistItems.instrumentId],
      });
  },

  async remove(tx: TxHandle, watchlistId: string, itemId: string): Promise<void> {
    await asDb(tx)
      .delete(schema.watchlistItems)
      .where(
        and(
          eq(schema.watchlistItems.id, itemId),
          eq(schema.watchlistItems.watchlistId, watchlistId),
        ),
      );
  },
};
