import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Px, Qty } from "@/core/money";
import { closeDb, getDb, schema } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { getLedger, getPortfolio, resetAccount } from "@/server/api/portfolio";
import { truncateAll } from "./helpers";

async function newUser(email: string) {
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  return { userId: res.user.id, email: res.user.email };
}

async function trade(userId: string, side: "BUY" | "SELL", qty: number, type = "MARKET" as const) {
  const c = getContainer();
  const account = (await c.accountService.getActiveForUser(userId))!;
  const instrument = await c.instrumentService.getOrRegister("AAPL");
  const quote = await c.marketData.getQuote("AAPL");
  const placed = await c.ordersService.place({
    account,
    instrument,
    side,
    type,
    qty: Qty.of(qty),
    limitPrice: null,
    refPrice: quote.ask ?? quote.last,
    idempotencyKey: crypto.randomUUID(),
  });
  await c.executionService.submit(placed.order.id);
  return placed.order.id;
}

describe("portfolio & reset", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
    getContainer().fixtureProvider!.setPrice("AAPL", "200.0000");
  });
  afterAll(closeDb);

  it("portfolio view: equity = cash + positions value, with asOf (invariant 12)", async () => {
    const { userId } = await newUser("pf@example.com");
    const session = { userId, email: "pf@example.com", name: "T" };
    await trade(userId, "BUY", 10);

    const view = (await getPortfolio(session)) as {
      positions: Array<Record<string, string>>;
      summary: Record<string, string>;
    };
    expect(view.positions).toHaveLength(1);
    const pos = view.positions[0]!;
    expect(pos.symbol).toBe("AAPL");
    expect(pos.qty).toBe("10");
    expect(pos.sellableQty).toBe("10");
    // Bought at ask 200.10 -> basis 2001.00, avg 200.1000.
    expect(pos.avgCost).toBe("200.1000");
    expect(pos.quoteTs).toBeTruthy();

    // equity = cash (97999.00) + market value (10 x last 200.00 = 2000.00)
    expect(view.summary.cash).toBe("97999.00");
    expect(view.summary.positionsValue).toBe("2000.00");
    expect(view.summary.equity).toBe("99999.00");
    expect(view.summary.asOf).toBeTruthy();
  });

  it("realized P&L is replay-derived and consistent with fills", async () => {
    const { userId } = await newUser("pnl@example.com");
    const session = { userId, email: "pnl@example.com", name: "T" };
    await trade(userId, "BUY", 10); // buys at ask 200.10 -> basis 2001.00
    getContainer().fixtureProvider!.setPrice("AAPL", "220.0000");
    await trade(userId, "SELL", 4); // sells at bid 219.89 -> proceeds 879.56

    const view = (await getPortfolio(session)) as { summary: Record<string, string> };
    // allocated basis = 2001.00 * 4/10 = 800.40; realized = 879.56 - 800.40
    expect(view.summary.realizedPnl).toBe("79.16");

    const pos = (await getDb().select().from(schema.positions))[0]!;
    expect(pos.qty).toBe(6n);
    expect(pos.costBasisTotal).toBe("1200.6000");
  });

  it("reset heals a lost cancellation via reconciliation before archiving", async () => {
    const { userId } = await newUser("reset-race@example.com");
    const session = { userId, email: "reset-race@example.com", name: "T" };
    const c = getContainer();
    const account = (await c.accountService.getActiveForUser(userId))!;
    const instrument = await c.instrumentService.getOrRegister("AAPL");
    const placed = await c.ordersService.place({
      account,
      instrument,
      side: "BUY",
      type: "LIMIT",
      qty: Qty.of(5),
      limitPrice: Px.fromString("150.0000"),
      refPrice: null,
      idempotencyKey: crypto.randomUUID(),
    });
    await c.executionService.submit(placed.order.id);

    // The stream goes deaf: the venue will confirm the cancel, but the live
    // event never reaches us. Reset's timeout->reconcile path must import the
    // terminal outcome BEFORE archiving (never archive with unresolved orders).
    c.deterministicBroker!.muteEvents(true);

    const result = (await resetAccount(
      new Request("http://test.local/api/v1/account/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
      session,
    )) as { account: { id: string } };

    expect(result.account.id).not.toBe(account.id);
    const [oldOrder] = await getDb()
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, placed.order.id));
    expect(oldOrder!.state).toBe("CANCELLED"); // imported by reconciliation
    const [oldAccount] = await getDb()
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id));
    expect(oldAccount!.status).toBe("ARCHIVED");
  }, 20_000);

  it("reset cancels open orders, archives everything, and provisions fresh (invariant 14)", async () => {
    const { userId } = await newUser("reset@example.com");
    const session = { userId, email: "reset@example.com", name: "T" };
    await trade(userId, "BUY", 10);

    // Leave a resting limit order open.
    const c = getContainer();
    const account = (await c.accountService.getActiveForUser(userId))!;
    const instrument = await c.instrumentService.getOrRegister("AAPL");
    const placed = await c.ordersService.place({
      account,
      instrument,
      side: "BUY",
      type: "LIMIT",
      qty: Qty.of(5),
      limitPrice: Px.fromString("150.0000"),
      refPrice: null,
      idempotencyKey: crypto.randomUUID(),
    });
    await c.executionService.submit(placed.order.id);

    const result = (await resetAccount(
      new Request("http://test.local/api/v1/account/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
      session,
    )) as { account: { id: string; cash: string } };

    expect(result.account.id).not.toBe(account.id);
    expect(result.account.cash).toBe("100000.00");

    // Old account + its history remain, archived — nothing deleted.
    const [oldAccount] = await getDb()
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id));
    expect(oldAccount!.status).toBe("ARCHIVED");
    const oldLedger = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, account.id));
    expect(oldLedger.length).toBeGreaterThanOrEqual(2); // deposit + trade
    const [oldOrder] = await getDb()
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, placed.order.id));
    expect(oldOrder!.state).toBe("CANCELLED");

    // Fresh account is usable immediately.
    await trade(userId, "BUY", 1);
    const view = (await getPortfolio(session)) as { positions: unknown[] };
    expect(view.positions).toHaveLength(1);

    // Archived history stays visible in Activity (the Settings promise).
    const ledger = (await getLedger(new Request("http://test.local/api/v1/ledger"), session)) as {
      entries: Array<{ archived: boolean; description: string }>;
    };
    expect(ledger.entries.some((e) => e.archived)).toBe(true);
    expect(ledger.entries.some((e) => !e.archived)).toBe(true);
  });
});
