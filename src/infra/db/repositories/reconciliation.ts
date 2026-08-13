import { and, eq, sql } from "drizzle-orm";
import type { ReconciliationReads, ReconciliationStatus } from "@/core/reconciliation";
import type { TxHandle } from "@/core/shared";
import { schema } from "..";
import { asDb } from "../tx";

export const reconciliationReads: ReconciliationReads = {
  async listActiveAccountIds(tx: TxHandle): Promise<string[]> {
    const rows = await asDb(tx)
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.status, "ACTIVE"));
    return rows.map((r) => r.id);
  },

  async setReconciliationStatus(
    tx: TxHandle,
    accountId: string,
    status: ReconciliationStatus,
    at: Date,
  ): Promise<void> {
    await asDb(tx)
      .update(schema.brokerAccounts)
      .set({
        reconciliationStatus: status,
        lastReconciledAt: at,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.brokerAccounts.tradingAccountId, accountId));
  },
};

/** Stream-cursor persistence (replayable SSE resume, ADR-010). */
export const streamCursorsRepository = {
  async get(tx: TxHandle, broker: "ALPACA_PAPER" | "DETERMINISTIC", stream: string) {
    const [row] = await asDb(tx)
      .select()
      .from(schema.streamCursors)
      .where(and(eq(schema.streamCursors.broker, broker), eq(schema.streamCursors.stream, stream)));
    return row?.lastUlid ?? null;
  },

  async set(
    tx: TxHandle,
    broker: "ALPACA_PAPER" | "DETERMINISTIC",
    stream: string,
    lastUlid: string,
  ): Promise<void> {
    await asDb(tx)
      .insert(schema.streamCursors)
      .values({ broker, stream, lastUlid })
      .onConflictDoUpdate({
        target: [schema.streamCursors.broker, schema.streamCursors.stream],
        set: { lastUlid, updatedAt: sql`now()` },
      });
  },
};
