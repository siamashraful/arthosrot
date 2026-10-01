import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type {
  CashTransfer,
  CashTransferDirection,
  CashTransfersRepository,
  NewCashTransfer,
} from "@/core/cash-transfers";
import { Money } from "@/core/money";
import type { TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

type Row = typeof schema.cashTransfers.$inferSelect;

function toTransfer(row: Row): CashTransfer {
  return {
    id: row.id,
    accountId: row.accountId,
    direction: row.direction,
    amount: Money.fromString(row.amount),
    state: row.state,
    venueTransferId: row.venueTransferId,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
    updatedAt: row.updatedAt,
  };
}

/** SUM of NUMERIC(18,2) may print without decimals ("500"); normalize. */
function moneyFromSum(raw: string | undefined): Money {
  const value = raw ?? "0";
  return Money.fromString(value.includes(".") ? value : `${value}.00`);
}

export const cashTransfersRepository = {
  async insert(tx: TxHandle, input: NewCashTransfer): Promise<CashTransfer | null> {
    const rows = await asDb(tx)
      .insert(schema.cashTransfers)
      .values({
        accountId: input.accountId,
        direction: input.direction,
        amount: input.amount.toString(),
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      })
      .onConflictDoNothing({
        target: [schema.cashTransfers.accountId, schema.cashTransfers.idempotencyKey],
      })
      .returning();
    return rows[0] ? toTransfer(rows[0]) : null;
  },

  async getById(tx: TxHandle, id: string): Promise<CashTransfer | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.id, id));
    return row ? toTransfer(row) : null;
  },

  async getByIdForUpdate(tx: TxHandle, id: string): Promise<CashTransfer | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.id, id))
      .for("update");
    return row ? toTransfer(row) : null;
  },

  async getByIdempotencyKey(
    tx: TxHandle,
    accountId: string,
    key: string,
  ): Promise<CashTransfer | null> {
    const [row] = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(
        and(
          eq(schema.cashTransfers.accountId, accountId),
          eq(schema.cashTransfers.idempotencyKey, key),
        ),
      );
    return row ? toTransfer(row) : null;
  },

  async listForAccount(tx: TxHandle, accountId: string, limit: number): Promise<CashTransfer[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.accountId, accountId))
      .orderBy(desc(schema.cashTransfers.createdAt), desc(schema.cashTransfers.id))
      .limit(limit);
    return rows.map(toTransfer);
  },

  async listPendingForAccount(tx: TxHandle, accountId: string): Promise<CashTransfer[]> {
    const rows = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(
        and(
          eq(schema.cashTransfers.accountId, accountId),
          eq(schema.cashTransfers.state, "PENDING"),
        ),
      )
      .orderBy(schema.cashTransfers.createdAt, schema.cashTransfers.id);
    return rows.map(toTransfer);
  },

  async listAccountIdsWithPending(tx: TxHandle): Promise<string[]> {
    const rows = await asDb(tx)
      .selectDistinct({ accountId: schema.cashTransfers.accountId })
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.state, "PENDING"));
    return rows.map((r) => r.accountId);
  },

  async sumPending(
    tx: TxHandle,
    accountId: string,
    direction: CashTransferDirection,
  ): Promise<Money> {
    const [row] = await asDb(tx)
      .select({ total: sql<string>`coalesce(sum(${schema.cashTransfers.amount}), 0)::text` })
      .from(schema.cashTransfers)
      .where(
        and(
          eq(schema.cashTransfers.accountId, accountId),
          eq(schema.cashTransfers.direction, direction),
          eq(schema.cashTransfers.state, "PENDING"),
        ),
      );
    return moneyFromSum(row?.total);
  },

  /** CashHoldReader / WithdrawalHoldReader ports (orders + portfolio). */
  async sumPendingWithdrawals(tx: TxHandle, accountId: string): Promise<Money> {
    return cashTransfersRepository.sumPending(tx, accountId, "WITHDRAWAL");
  },

  async sumDepositsSince(tx: TxHandle, accountId: string, since: Date): Promise<Money> {
    const [row] = await asDb(tx)
      .select({ total: sql<string>`coalesce(sum(${schema.cashTransfers.amount}), 0)::text` })
      .from(schema.cashTransfers)
      .where(
        and(
          eq(schema.cashTransfers.accountId, accountId),
          eq(schema.cashTransfers.direction, "DEPOSIT"),
          inArray(schema.cashTransfers.state, ["PENDING", "SETTLED"]),
          gte(schema.cashTransfers.createdAt, since),
        ),
      );
    return moneyFromSum(row?.total);
  },

  async isVenueIdLinked(tx: TxHandle, venueTransferId: string): Promise<boolean> {
    const [row] = await asDb(tx)
      .select({ id: schema.cashTransfers.id })
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.venueTransferId, venueTransferId));
    return Boolean(row);
  },

  async listCanceledWithVenueId(
    tx: TxHandle,
    reasons: readonly string[],
    since: Date,
  ): Promise<CashTransfer[]> {
    if (reasons.length === 0) return [];
    const rows = await asDb(tx)
      .select()
      .from(schema.cashTransfers)
      .where(
        and(
          eq(schema.cashTransfers.state, "CANCELED"),
          isNotNull(schema.cashTransfers.venueTransferId),
          inArray(schema.cashTransfers.failureReason, [...reasons]),
          gte(schema.cashTransfers.createdAt, since),
        ),
      )
      .orderBy(schema.cashTransfers.createdAt, schema.cashTransfers.id);
    return rows.map(toTransfer);
  },

  async setVenueTransferId(tx: TxHandle, id: string, venueTransferId: string): Promise<void> {
    await asDb(tx)
      .update(schema.cashTransfers)
      .set({ venueTransferId, updatedAt: sql`now()` })
      .where(eq(schema.cashTransfers.id, id));
  },

  async setState(
    tx: TxHandle,
    id: string,
    patch: {
      state: CashTransfer["state"];
      failureReason?: string | null;
      settledAt?: Date | null;
    },
  ): Promise<void> {
    await asDb(tx)
      .update(schema.cashTransfers)
      .set({
        state: patch.state,
        ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        ...(patch.settledAt !== undefined ? { settledAt: patch.settledAt } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.cashTransfers.id, id));
  },
} satisfies CashTransfersRepository & Record<string, unknown>;
