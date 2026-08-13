import { sql } from "drizzle-orm";
import { getDb } from "@/infra/db";

/** Wipe all data between tests (order respects FKs via CASCADE truncate). */
export async function truncateAll(): Promise<void> {
  await getDb().execute(sql`
    TRUNCATE TABLE
      watchlist_items, watchlists,
      fills, order_events, orders,
      positions, ledger_entries,
      broker_accounts, stream_cursors, accounts,
      market_data_cache, instruments,
      sessions, auth_accounts, verifications, users
    CASCADE
  `);
}
