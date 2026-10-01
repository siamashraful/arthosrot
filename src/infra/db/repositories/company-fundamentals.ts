import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "..";

export type FundamentalsRow = typeof schema.companyFundamentals.$inferSelect;

export interface SharesRow {
  symbol: string;
  cik: string;
  name: string;
  shares: string;
  sharesAsOf: string;
  sharesBasis: string;
}

/**
 * Key-stats fundamentals (display data). Shares are written in bulk by the
 * daily SEC job; trailing EPS is written lazily per company on first view.
 */
export const companyFundamentals = {
  async upsertShares(rows: readonly SharesRow[]): Promise<void> {
    const db = getDb();
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(schema.companyFundamentals)
        .values(rows.slice(i, i + 500).map((r) => ({ ...r, shares: BigInt(r.shares) })))
        .onConflictDoUpdate({
          target: schema.companyFundamentals.symbol,
          set: {
            cik: sql`excluded.cik`,
            name: sql`excluded.name`,
            shares: sql`excluded.shares`,
            sharesAsOf: sql`excluded.shares_as_of`,
            sharesBasis: sql`excluded.shares_basis`,
            updatedAt: sql`now()`,
          },
        });
    }
  },

  async get(symbol: string): Promise<FundamentalsRow | null> {
    const [row] = await getDb()
      .select()
      .from(schema.companyFundamentals)
      .where(eq(schema.companyFundamentals.symbol, symbol));
    return row ?? null;
  },

  /** EPS belongs to the company: every listed class of the CIK gets it. */
  async saveEps(
    cik: string,
    eps: { eps: string; basis: string; periodEnd: string } | null,
    checkedAt: Date,
  ): Promise<void> {
    await getDb()
      .update(schema.companyFundamentals)
      .set({
        epsTtm: eps?.eps ?? null,
        epsBasis: eps?.basis ?? null,
        epsPeriodEnd: eps?.periodEnd ?? null,
        epsCheckedAt: checkedAt,
      })
      .where(eq(schema.companyFundamentals.cik, cik));
  },
};
