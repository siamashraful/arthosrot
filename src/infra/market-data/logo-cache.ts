import { eq } from "drizzle-orm";
import { schema } from "../db";
import { asDb, pgTransactionRunner } from "../db/tx";

/**
 * Logo byte cache on market_data_cache (display reference data — the same
 * charter as quotes/candles). Bytes travel as base64 in the jsonb payload;
 * a few KB per symbol, 7-day TTL.
 */

export interface CachedLogo {
  b64: string;
  contentType: string;
}

const LOGO_TTL_MS = 7 * 24 * 60 * 60_000;

export async function getCachedLogo(symbol: string): Promise<CachedLogo | null> {
  return pgTransactionRunner.run(async (tx) => {
    const [row] = await asDb(tx)
      .select()
      .from(schema.marketDataCache)
      .where(eq(schema.marketDataCache.cacheKey, `logo:${symbol}`));
    return row && row.staleAfter.getTime() > Date.now()
      ? (row.payload as unknown as CachedLogo)
      : null;
  });
}

export async function putCachedLogo(symbol: string, logo: CachedLogo): Promise<void> {
  const now = Date.now();
  await pgTransactionRunner.run((tx) =>
    asDb(tx)
      .insert(schema.marketDataCache)
      .values({
        cacheKey: `logo:${symbol}`,
        payload: logo,
        fetchedAt: new Date(now),
        staleAfter: new Date(now + LOGO_TTL_MS),
      })
      .onConflictDoUpdate({
        target: schema.marketDataCache.cacheKey,
        set: {
          payload: logo,
          fetchedAt: new Date(now),
          staleAfter: new Date(now + LOGO_TTL_MS),
        },
      }),
  );
}
