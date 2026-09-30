import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { AppError } from "@/core/shared";
import { closeDb, getDb, schema } from "@/infra/db";
import { resetContainerForTests } from "@/server/container";
import { addWatchlistItem, getLedger, removeWatchlistItem } from "@/server/api/portfolio";
import type { SessionInfo } from "@/server/session";
import { signupWithAccount, truncateAll } from "./helpers";

/**
 * Server contracts behind the UI interactions made functional in the
 * interaction pass: watchlist removal and ledger paging.
 */

type LedgerPage = { entries: Array<{ id: string }>; nextCursor: string | null };

function ledgerRequest(before?: string): Request {
  return new Request(`http://test/api/v1/ledger${before ? `?before=${before}` : ""}`);
}

// one pool for the whole file — closing it per describe strands the next block
afterAll(closeDb);

describe("watchlist removal", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
  });
  it("removes the user's own item and returns the fresh list", async () => {
    const { userId } = await signupWithAccount("watch@example.com");
    const session: SessionInfo = { userId, email: "watch@example.com", name: "T" };
    const added = (await addWatchlistItem(
      new Request("http://test", { method: "POST", body: JSON.stringify({ symbol: "AAPL" }) }),
      session,
    )) as { items: Array<{ id: string; symbol: string }> };
    expect(added.items.map((i) => i.symbol)).toEqual(["AAPL"]);

    const after = (await removeWatchlistItem(added.items[0]!.id, session)) as {
      items: unknown[];
    };
    expect(after.items).toEqual([]);
  });

  it("cannot remove another user's item (ownership is the watchlist, not the id)", async () => {
    const a = await signupWithAccount("a@example.com");
    const b = await signupWithAccount("b@example.com");
    const sa: SessionInfo = { userId: a.userId, email: "a@example.com", name: "A" };
    const sb: SessionInfo = { userId: b.userId, email: "b@example.com", name: "B" };
    const added = (await addWatchlistItem(
      new Request("http://test", { method: "POST", body: JSON.stringify({ symbol: "MSFT" }) }),
      sa,
    )) as { items: Array<{ id: string }> };

    await removeWatchlistItem(added.items[0]!.id, sb); // B aims at A's item id
    const stillThere = await getDb()
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.id, added.items[0]!.id));
    expect(stillThere).toHaveLength(1);
  });

  it("a malformed item id is NOT_FOUND, not a database error", async () => {
    const { userId } = await signupWithAccount("bad@example.com");
    const session: SessionInfo = { userId, email: "bad@example.com", name: "T" };
    await expect(removeWatchlistItem("not-a-uuid", session)).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);
  });
});

describe("ledger paging", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
  });
  it("walks every entry exactly once, even across identical timestamps", async () => {
    const { userId, account } = await signupWithAccount("ledger@example.com");
    const session: SessionInfo = { userId, email: "ledger@example.com", name: "T" };
    // 120 extra entries in ONE timestamp — the shape a fill's TRADE + FEE
    // pair produces (one transaction, one now()). A created_at-only cursor
    // loses rows at every page boundary inside such a run.
    const at = new Date("2026-09-01T15:00:00Z");
    await getDb()
      .insert(schema.ledgerEntries)
      .values(
        Array.from({ length: 120 }, (_, i) => ({
          accountId: account.id,
          entryType: "ADJUSTMENT" as const,
          amount: "1.00",
          description: `tie ${i}`,
          createdAt: at,
        })),
      );
    const counted = (await getDb().execute(
      sql`select count(*)::int as total from ledger_entries where account_id = ${account.id}`,
    )) as unknown as { rows: Array<{ total: number }> };
    const total = counted.rows[0]!.total;

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = (await getLedger(ledgerRequest(cursor), session)) as LedgerPage;
      seen.push(...page.entries.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen.length).toBe(total); // nothing skipped
    expect(pages).toBe(Math.ceil(total / 50));
  });

  it("the last page reports no further cursor", async () => {
    const { userId } = await signupWithAccount("short@example.com");
    const session: SessionInfo = { userId, email: "short@example.com", name: "T" };
    const page = (await getLedger(ledgerRequest(), session)) as LedgerPage;
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor as a validation error", async () => {
    const { userId } = await signupWithAccount("cursor@example.com");
    const session: SessionInfo = { userId, email: "cursor@example.com", name: "T" };
    await expect(getLedger(ledgerRequest("oops"), session)).rejects.toThrow();
  });
});
