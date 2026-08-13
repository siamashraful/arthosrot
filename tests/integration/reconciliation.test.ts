import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Px, Qty } from "@/core/money";
import { closeDb, getDb, schema } from "@/infra/db";
import { asTx } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { truncateAll } from "./helpers";

/**
 * Reconciliation scenarios (EXECUTION.md testing contract): stream loss,
 * stream+REST duplicates, REST-truth convergence, dangling submissions.
 */

async function newUser(email: string) {
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  return res.user.id;
}

async function placeLimit(userId: string, qty: number, limitPrice: string) {
  const c = getContainer();
  const account = (await c.accountService.getActiveForUser(userId))!;
  const instrument = await c.instrumentService.getOrRegister("AAPL");
  const placed = await c.ordersService.place({
    account,
    instrument,
    side: "BUY",
    type: "LIMIT",
    qty: Qty.of(qty),
    limitPrice: Px.fromString(limitPrice),
    refPrice: null,
    idempotencyKey: crypto.randomUUID(),
  });
  return { placed, account };
}

async function orderState(id: string) {
  const [row] = await getDb().select().from(schema.orders).where(eq(schema.orders.id, id));
  return row!;
}

describe("reconciliation engine", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
    getContainer().fixtureProvider!.setPrice("AAPL", "200.0000");
  });
  afterAll(closeDb);

  it("stream loss: broker fills while disconnected -> reconciliation imports the fill exactly once", async () => {
    const userId = await newUser("recon1@example.com");
    const c = getContainer();
    const { placed, account } = await placeLimit(userId, 10, "190.0000");
    await c.executionService.submit(placed.order.id);
    expect((await orderState(placed.order.id)).state).toBe("ACCEPTED");

    // Stream disconnects; the venue fills the order while we're deaf.
    c.deterministicBroker!.muteEvents(true);
    c.fixtureProvider!.setPrice("AAPL", "189.0000");
    await c.deterministicBroker!.tick();
    expect((await orderState(placed.order.id)).state).toBe("ACCEPTED"); // local is stale

    // Reconnect-time reconciliation replays venue events idempotently.
    const result = await c.reconciliationService.reconcileAll();
    expect(result.errors).toEqual([]);
    const after = await orderState(placed.order.id);
    expect(after.state).toBe("FILLED");
    expect(after.filledQty).toBe(10n);

    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, placed.order.id));
    expect(fills).toHaveLength(1);

    // Running reconciliation AGAIN double-applies nothing (invariant 15).
    await c.reconciliationService.reconcileAll();
    const fillsAfter = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, placed.order.id));
    expect(fillsAfter).toHaveLength(1);
    const rec = await getDb().transaction((tx) => c.ledgerService.reconcile(asTx(tx), account.id));
    expect(rec.inBalance).toBe(true);
  });

  it("same fill via stream then REST reconciliation -> one financial effect", async () => {
    const userId = await newUser("recon2@example.com");
    const c = getContainer();
    const { placed, account } = await placeLimit(userId, 10, "210.0000"); // marketable at 200
    await c.executionService.submit(placed.order.id); // fills via live stream
    expect((await orderState(placed.order.id)).state).toBe("FILLED");
    const cashAfter = (
      await getDb().select().from(schema.accounts).where(eq(schema.accounts.id, account.id))
    )[0]!.cashBalance;

    const result = await c.reconciliationService.reconcileAll();
    expect(result.errors).toEqual([]);

    const cashFinal = (
      await getDb().select().from(schema.accounts).where(eq(schema.accounts.id, account.id))
    )[0]!.cashBalance;
    expect(cashFinal).toBe(cashAfter);
    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, placed.order.id));
    expect(fills).toHaveLength(1);
  });

  it("dangling PENDING_SUBMISSION past the grace window becomes SUBMIT_FAILED", async () => {
    const userId = await newUser("recon3@example.com");
    const c = getContainer();
    const { placed } = await placeLimit(userId, 5, "150.0000");
    // Never submitted (crash between local commit and submit). Age the order
    // past the grace window.
    await getDb()
      .update(schema.orders)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.orders.id, placed.order.id));

    await c.reconciliationService.reconcileAll();
    const after = await orderState(placed.order.id);
    expect(after.state).toBe("SUBMIT_FAILED");
    expect(after.reservedCash).toBe("0.00");
  });

  it("marks broker accounts HEALTHY after a clean pass", async () => {
    const userId = await newUser("recon4@example.com");
    const c = getContainer();
    const account = (await c.accountService.getActiveForUser(userId))!;
    await c.reconciliationService.reconcileAll();
    const [row] = await getDb()
      .select()
      .from(schema.brokerAccounts)
      .where(eq(schema.brokerAccounts.tradingAccountId, account.id));
    expect(row!.reconciliationStatus).toBe("HEALTHY");
    expect(row!.lastReconciledAt).not.toBeNull();
  });
});
