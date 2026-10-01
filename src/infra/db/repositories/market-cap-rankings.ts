import { asc, desc, eq } from "drizzle-orm";
import type { MarketCapRankingStore, StoredRanking } from "@/core/discovery";
import { getDb, schema } from "..";

/** Ranking snapshots — append-only; the newest snapshot per list wins. */
export const marketCapRankings: MarketCapRankingStore = {
  async latest(list: string): Promise<StoredRanking | null> {
    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(schema.marketCapSnapshots)
      .where(eq(schema.marketCapSnapshots.list, list))
      .orderBy(desc(schema.marketCapSnapshots.createdAt), desc(schema.marketCapSnapshots.asOf))
      .limit(1);
    if (!snapshot) return null;
    const rows = await db
      .select()
      .from(schema.marketCapEntries)
      .where(eq(schema.marketCapEntries.snapshotId, snapshot.id))
      .orderBy(asc(schema.marketCapEntries.rank));
    return {
      list: snapshot.list,
      asOf: snapshot.asOf,
      source: snapshot.source,
      entries: rows.map((r) => ({
        rank: r.rank,
        cik: r.cik,
        symbol: r.symbol,
        name: r.name,
        shares: r.shares.toString(),
        price: r.price,
        marketCap: r.marketCap,
      })),
    };
  },

  async save(snapshot: StoredRanking): Promise<void> {
    await getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.marketCapSnapshots)
        .values({ list: snapshot.list, asOf: snapshot.asOf, source: snapshot.source })
        .returning({ id: schema.marketCapSnapshots.id });
      if (snapshot.entries.length === 0) return;
      await tx.insert(schema.marketCapEntries).values(
        snapshot.entries.map((e) => ({
          snapshotId: row!.id,
          rank: e.rank,
          cik: e.cik,
          symbol: e.symbol,
          name: e.name,
          shares: BigInt(e.shares),
          price: e.price,
          marketCap: e.marketCap,
        })),
      );
    });
  },
};
