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

/**
 * Signup + explicit account provisioning. Signup no longer auto-provisions
 * (the user chooses starting cash on the onboarding panel — FR-2), so tests
 * that need a funded account provision one here. Deterministic venue funding
 * settles instantly, so the account returns ACTIVE.
 */
export async function signupWithAccount(email: string, startingCash = "100000.00") {
  const { getAuth } = await import("@/server/auth");
  const { getContainer } = await import("@/server/container");
  const { Money } = await import("@/core/money");
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  const account = await getContainer().accountService.openPaperAccount(
    res.user.id,
    Money.fromString(startingCash),
  );
  return { userId: res.user.id, email: res.user.email, account };
}
