import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/infra/db";
import { truncateAll } from "./helpers";

/** Invariant 8: ledger_entries (and other financial history) are append-only. */
describe("append-only enforcement", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  async function seedLedgerEntry() {
    const db = getDb();
    await db.insert(schema.users).values({ id: "u1", name: "U", email: "u@example.com" });
    const [account] = await db
      .insert(schema.accounts)
      .values({ userId: "u1", status: "ACTIVE", startingCash: "10000.00", cashBalance: "10000.00" })
      .returning();
    const [entry] = await db
      .insert(schema.ledgerEntries)
      .values({
        accountId: account!.id,
        entryType: "DEPOSIT",
        amount: "10000.00",
        description: "Opening deposit",
      })
      .returning();
    return entry!;
  }

  it("rejects UPDATE on ledger_entries and leaves the row unchanged", async () => {
    const entry = await seedLedgerEntry();
    await expect(
      getDb().execute(sql`UPDATE ledger_entries SET amount = '1.00' WHERE id = ${entry.id}`),
    ).rejects.toThrow();
    const [row] = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(sql`id = ${entry.id}`);
    expect(row?.amount).toBe("10000.00");
  });

  it("rejects DELETE on ledger_entries and keeps the row", async () => {
    const entry = await seedLedgerEntry();
    await expect(
      getDb().execute(sql`DELETE FROM ledger_entries WHERE id = ${entry.id}`),
    ).rejects.toThrow();
    const rows = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(sql`id = ${entry.id}`);
    expect(rows).toHaveLength(1);
  });

  it("rejects zero-amount ledger entries", async () => {
    const entry = await seedLedgerEntry();
    await expect(
      getDb().insert(schema.ledgerEntries).values({
        accountId: entry.accountId,
        entryType: "ADJUSTMENT",
        amount: "0.00",
        description: "zero",
      }),
    ).rejects.toThrow();
  });

  it("enforces one ACTIVE account per user", async () => {
    const entry = await seedLedgerEntry();
    const db = getDb();
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(sql`id = ${entry.accountId}`);
    await expect(
      db.insert(schema.accounts).values({
        userId: account!.userId,
        status: "ACTIVE",
        startingCash: "10000.00",
      }),
    ).rejects.toThrow();
  });

  it("enforces PAPER-only account mode", async () => {
    await seedLedgerEntry();
    await expect(
      getDb().execute(
        sql`INSERT INTO accounts (user_id, mode, status, starting_cash) VALUES ('u1', 'LIVE', 'ARCHIVED', '1.00')`,
      ),
    ).rejects.toThrow();
  });
});
