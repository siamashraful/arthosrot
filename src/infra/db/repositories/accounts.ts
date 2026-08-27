import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Account, AccountsRepository, AccountStatus, BrokerAccountRef } from "@/core/accounts";
import { Money } from "@/core/money";
import { invariant, type TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type AccountRow = typeof schema.accounts.$inferSelect;

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.userId,
    mode: "PAPER",
    status: row.status,
    currency: "USD",
    startingCash: Money.fromString(row.startingCash),
    cashBalance: Money.fromString(row.cashBalance),
    createdAt: row.createdAt,
  };
}

export const accountsRepository: AccountsRepository = {
  async create(tx: TxHandle, input: { userId: string; startingCash: Money }): Promise<Account> {
    const [row] = await asDb(tx)
      .insert(schema.accounts)
      .values({
        userId: input.userId,
        status: "PROVISIONING",
        startingCash: input.startingCash.toString(),
        cashBalance: "0",
      })
      .returning();
    invariant(row, "account insert returned no row");
    return toAccount(row);
  },

  async getById(tx: TxHandle, id: string): Promise<Account | null> {
    const [row] = await asDb(tx).select().from(schema.accounts).where(eq(schema.accounts.id, id));
    return row ? toAccount(row) : null;
  },

  async getActiveForUser(tx: TxHandle, userId: string): Promise<Account | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.status, "ACTIVE")));
    return row ? toAccount(row) : null;
  },

  async getCurrentForUser(tx: TxHandle, userId: string): Promise<Account | null> {
    // Latest non-ARCHIVED account: the one the user is currently living in,
    // whatever its provisioning state.
    const [row] = await asDb(tx)
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), ne(schema.accounts.status, "ARCHIVED")))
      .orderBy(desc(schema.accounts.createdAt))
      .limit(1);
    return row ? toAccount(row) : null;
  },

  async listProvisioningIds(tx: TxHandle): Promise<string[]> {
    const rows = await asDb(tx)
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.status, "PROVISIONING"));
    return rows.map((r) => r.id);
  },

  async lockForUpdate(tx: TxHandle, id: string): Promise<Account> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, id))
      .for("update");
    invariant(row, `account ${id} not found for locking`);
    return toAccount(row);
  },

  async setStatus(tx: TxHandle, id: string, status: AccountStatus): Promise<void> {
    await asDb(tx)
      .update(schema.accounts)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(schema.accounts.id, id));
  },

  async adjustCash(tx: TxHandle, id: string, delta: Money): Promise<void> {
    await asDb(tx)
      .update(schema.accounts)
      .set({
        cashBalance: sql`${schema.accounts.cashBalance} + ${delta.toString()}::numeric`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.accounts.id, id));
  },

  async getCachedCash(tx: TxHandle, id: string): Promise<Money> {
    const [row] = await asDb(tx)
      .select({ cash: schema.accounts.cashBalance })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, id));
    invariant(row, `account ${id} not found`);
    return Money.fromString(row.cash);
  },

  async linkBrokerAccount(tx: TxHandle, accountId: string, ref: BrokerAccountRef): Promise<void> {
    await asDb(tx).insert(schema.brokerAccounts).values({
      tradingAccountId: accountId,
      broker: ref.broker,
      externalAccountId: ref.externalAccountId,
      status: "ACTIVE",
    });
  },

  async getBrokerAccount(tx: TxHandle, accountId: string): Promise<BrokerAccountRef | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.brokerAccounts)
      .where(eq(schema.brokerAccounts.tradingAccountId, accountId));
    return row ? { broker: row.broker, externalAccountId: row.externalAccountId } : null;
  },

  async archiveBrokerAccount(tx: TxHandle, accountId: string): Promise<void> {
    await asDb(tx)
      .update(schema.brokerAccounts)
      .set({ status: "ARCHIVED", updatedAt: sql`now()` })
      .where(eq(schema.brokerAccounts.tradingAccountId, accountId));
  },
};
