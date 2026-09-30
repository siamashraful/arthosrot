import { and, desc, eq, sql } from "drizzle-orm";
import type { LedgerEntry, LedgerRepository, NewLedgerEntry } from "@/core/ledger";
import { Money } from "@/core/money";
import { invariant, type TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type LedgerRow = typeof schema.ledgerEntries.$inferSelect;

function toEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    accountId: row.accountId,
    entryType: row.entryType as LedgerEntry["entryType"],
    amount: Money.fromString(row.amount),
    refType: row.refType,
    refId: row.refId,
    description: row.description,
    createdAt: row.createdAt,
  };
}

export const ledgerRepository = {
  async insert(tx: TxHandle, entry: NewLedgerEntry): Promise<LedgerEntry> {
    const [row] = await asDb(tx)
      .insert(schema.ledgerEntries)
      .values({
        accountId: entry.accountId,
        entryType: entry.entryType,
        amount: entry.amount.toString(),
        refType: entry.refType,
        refId: entry.refId,
        description: entry.description,
      })
      .returning();
    invariant(row, "ledger insert returned no row");
    return toEntry(row);
  },

  async sumForAccount(tx: TxHandle, accountId: string): Promise<Money> {
    const [row] = await asDb(tx)
      .select({ total: sql<string>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::text` })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId));
    const raw = row?.total ?? "0";
    // SUM of NUMERIC(18,2) may print without decimals ("10000"); normalize.
    return Money.fromString(raw.includes(".") ? raw : `${raw}.00`);
  },

  /** Full ascending walk for one account — the equity-series cash input. */
  async listForAccountAscending(
    tx: TxHandle,
    accountId: string,
  ): Promise<Array<{ amount: Money; createdAt: Date; entryType: string }>> {
    const rows = await asDb(tx)
      .select({
        amount: schema.ledgerEntries.amount,
        createdAt: schema.ledgerEntries.createdAt,
        entryType: schema.ledgerEntries.entryType,
      })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId))
      .orderBy(schema.ledgerEntries.createdAt, schema.ledgerEntries.id);
    return rows.map((r) => ({
      amount: Money.fromString(r.amount),
      createdAt: r.createdAt,
      entryType: r.entryType,
    }));
  },

  async listForUser(
    tx: TxHandle,
    userId: string,
    limit: number,
    beforeId?: string,
  ): Promise<Array<LedgerEntry & { accountArchived: boolean }>> {
    const db = asDb(tx);
    const conditions = [eq(schema.accounts.userId, userId)];
    if (beforeId) {
      // Keyset cursor on (created_at, id): entries posted in one transaction
      // (a fill's TRADE and FEE) share created_at exactly, so a timestamp-only
      // cursor would skip the sibling that fell on the far side of a page.
      const [pivot] = await db
        .select({ createdAt: schema.ledgerEntries.createdAt, id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .innerJoin(schema.accounts, eq(schema.ledgerEntries.accountId, schema.accounts.id))
        .where(and(eq(schema.ledgerEntries.id, beforeId), eq(schema.accounts.userId, userId)));
      if (!pivot) return []; // unknown or foreign cursor: nothing further to show
      conditions.push(
        sql`(${schema.ledgerEntries.createdAt}, ${schema.ledgerEntries.id}) < (${pivot.createdAt}, ${pivot.id})`,
      );
    }
    const rows = await db
      .select({ entry: schema.ledgerEntries, accountStatus: schema.accounts.status })
      .from(schema.ledgerEntries)
      .innerJoin(schema.accounts, eq(schema.ledgerEntries.accountId, schema.accounts.id))
      .where(and(...conditions))
      .orderBy(desc(schema.ledgerEntries.createdAt), desc(schema.ledgerEntries.id))
      .limit(limit);
    return rows.map((row) => ({
      ...toEntry(row.entry),
      accountArchived: row.accountStatus === "ARCHIVED",
    }));
  },
} satisfies LedgerRepository & Record<string, unknown>;
