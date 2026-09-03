import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { env } from "../src/env";
import { closeDb, getDb, schema } from "../src/infra/db";
import { SANDBOX_BASE } from "../src/infra/brokers/alpaca";

/**
 * Sync the instruments reference table from the Alpaca Assets API.
 *
 * Instrument SEARCH is DB-backed (the IEX data feed has no name-search
 * endpoint — ADR-007), so search coverage equals the rows in `instruments`.
 * The 30-symbol seed (scripts/seed.ts) is only a bootstrap for offline dev;
 * this script imports the venue's full active+tradable US-equity list
 * (~13k symbols) so users can find any stock the venue can actually trade.
 *
 * Filters: active, tradable, us_equity, and NOT OTC — OTC symbols are thinly
 * traded, IEX quote coverage for them is poor, and a beginner platform has no
 * business surfacing pink sheets in search.
 *
 * Idempotent upsert; symbols that leave the venue list are marked INACTIVE
 * (rows are never deleted — orders/positions may reference them).
 *
 * Usage: DATABASE_URL=... ALPACA_BROKER_KEY=... ALPACA_BROKER_SECRET=... \
 *          pnpm db:sync-instruments
 */

interface AssetRow {
  symbol: string;
  name: string;
  exchange: string;
  status: string;
  tradable: boolean;
  class: string;
}

async function fetchAssets(): Promise<AssetRow[]> {
  const { ALPACA_BROKER_KEY: key, ALPACA_BROKER_SECRET: secret } = env();
  if (!key || !secret) throw new Error("ALPACA_BROKER_KEY/SECRET required");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${SANDBOX_BASE}/v1/assets?status=active&asset_class=us_equity`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`assets fetch failed: HTTP ${res.status}`);
  return (await res.json()) as AssetRow[];
}

async function main(): Promise<void> {
  const assets = (await fetchAssets()).filter(
    (a) => a.tradable && a.exchange !== "OTC" && a.symbol.length <= 10,
  );
  console.log(`venue lists ${assets.length} tradable non-OTC US equities`);

  // Sanity floor BEFORE any write. The venue lists ~13k US equities; a
  // response far below that is a degraded/empty payload, and the INACTIVE
  // sweep below would mass-delist the whole table on it (drizzle renders
  // notInArray(col, []) as WHERE true — verified). Refuse, loudly.
  const MIN_PLAUSIBLE_ASSETS = 5_000;
  if (assets.length < MIN_PLAUSIBLE_ASSETS) {
    throw new Error(
      `refusing to sync: venue returned ${assets.length} assets (< ${MIN_PLAUSIBLE_ASSETS}) — ` +
        "degraded or empty response; the INACTIVE sweep would mass-delist the table",
    );
  }

  const db = getDb();
  const BATCH = 500;
  for (let i = 0; i < assets.length; i += BATCH) {
    const batch = assets.slice(i, i + BATCH).map((a) => ({
      symbol: a.symbol,
      // Some venue names are ALL CAPS or carry suffix noise; store verbatim —
      // display formatting is a UI concern, reference data stays faithful.
      name: a.name,
      exchange: a.exchange,
      status: "ACTIVE",
    }));
    await db
      .insert(schema.instruments)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.instruments.symbol,
        set: {
          name: sql`excluded.name`,
          exchange: sql`excluded.exchange`,
          status: sql`excluded.status`, // venue re-listing REACTIVATES a row
          updatedAt: sql`now()`,
        },
      });
    process.stdout.write(`\rupserted ${Math.min(i + BATCH, assets.length)}/${assets.length}`);
  }
  console.log();

  // Symbols no longer on the venue's tradable list: INACTIVE, never deleted.
  // Scoped three ways: only currently-ACTIVE rows (idempotent runs report a
  // real delta, not the cumulative history), and only rows this sync ever
  // owned — getOrRegister-created symbols carry exchange UNKNOWN and live in
  // the IEX-quotable universe, which the broker asset list does not govern.
  const symbols = assets.map((a) => a.symbol);
  const inactive = await db
    .update(schema.instruments)
    .set({ status: "INACTIVE", updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.instruments.status, "ACTIVE"),
        ne(schema.instruments.exchange, "UNKNOWN"),
        notInArray(schema.instruments.symbol, symbols),
      ),
    )
    .returning({ symbol: schema.instruments.symbol });
  if (inactive.length > 0) {
    console.log(`marked INACTIVE (left the venue list): ${inactive.length}`);
  }

  const res = await db.execute(
    sql`select count(*)::int as count from instruments where status = 'ACTIVE'`,
  );
  console.log(`instruments ACTIVE: ${(res.rows[0] as { count: number }).count}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
