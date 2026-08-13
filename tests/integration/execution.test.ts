import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Px, Qty } from "@/core/money";
import type { Order } from "@/core/orders";
import { closeDb, getDb, schema } from "@/infra/db";
import { asTx } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { truncateAll } from "./helpers";

/**
 * Execution integration suite against the DeterministicPaperBroker:
 * golden market-order scenario (vertical slice A), limit lifecycle (slice B),
 * partial fills, cancel race, duplicate events, idempotency, concurrency.
 * Fixture market status is forced OPEN so scenarios are calendar-independent.
 */

async function newUserAccount(email: string) {
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  const account = await getContainer().accountService.getActiveForUser(res.user.id);
  expect(account).not.toBeNull();
  return { userId: res.user.id, account: account! };
}

async function place(opts: {
  accountUserId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: number;
  limitPrice?: string;
  idempotencyKey?: string;
}) {
  const c = getContainer();
  const account = (await c.accountService.getActiveForUser(opts.accountUserId))!;
  const instrument = await c.instrumentService.getOrRegister(opts.symbol);
  const quote = await c.marketData.getQuote(opts.symbol);
  const placed = await c.ordersService.place({
    account,
    instrument,
    side: opts.side,
    type: opts.type,
    qty: Qty.of(opts.qty),
    limitPrice: opts.limitPrice ? Px.fromString(opts.limitPrice) : null,
    refPrice: quote.ask ?? quote.last,
    idempotencyKey: opts.idempotencyKey ?? crypto.randomUUID(),
  });
  if (!placed.replayed) await c.executionService.submit(placed.order.id);
  return placed;
}

async function getOrder(id: string): Promise<Order> {
  const order = await getDb().transaction((tx) =>
    getContainer().ordersService.getById(asTx(tx), id),
  );
  expect(order).not.toBeNull();
  return order!;
}

async function cashOf(accountId: string): Promise<string> {
  const [row] = await getDb()
    .select({ cash: schema.accounts.cashBalance })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId));
  return row!.cash;
}

async function positionOf(accountId: string, symbol: string) {
  const [row] = await getDb()
    .select()
    .from(schema.positions)
    .where(eq(schema.positions.accountId, accountId));
  return row && row.symbol === symbol ? row : null;
}

describe("execution (DeterministicPaperBroker)", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
    getContainer().fixtureProvider!.setPrice("AAPL", "200.0000");
  });
  afterAll(closeDb);

  it("golden market-order scenario (vertical slice A)", async () => {
    const { userId, account } = await newUserAccount("golden@example.com");
    const key = crypto.randomUUID();

    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 10,
      idempotencyKey: key,
    });
    const order = await getOrder(placed.order.id);
    expect(order.state).toBe("FILLED");
    expect(order.filledQty.toString()).toBe("10");
    expect(order.reservedCash.toString()).toBe("0.00");

    // Fill fact: at the fixture ask (200.10 = 200 + 5bps spread).
    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, order.id));
    expect(fills).toHaveLength(1);
    expect(fills[0]!.qty).toBe(10n);
    expect(fills[0]!.price).toBe("200.1000");
    expect(fills[0]!.notional).toBe("2001.00");

    // Ledger: one TRADE entry; cash projection reconciles (invariants 6/7).
    expect(await cashOf(account.id)).toBe("97999.00");
    const entries = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, account.id));
    expect(entries.map((e) => e.entryType).sort()).toEqual(["DEPOSIT", "TRADE"]);

    // Position: 10 AAPL @ basis 2001.00.
    const pos = await positionOf(account.id, "AAPL");
    expect(pos!.qty).toBe(10n);
    expect(pos!.costBasisTotal).toBe("2001.0000");

    // Idempotent replay (same key) returns the same order, no second effect.
    const replay = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 10,
      idempotencyKey: key,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.order.id).toBe(order.id);
    expect(await cashOf(account.id)).toBe("97999.00");
  });

  it("limit order lifecycle: rest -> price crosses -> fill (slice B-i)", async () => {
    const { userId, account } = await newUserAccount("limit@example.com");

    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: 10,
      limitPrice: "190.0000",
    });
    let order = await getOrder(placed.order.id);
    expect(order.state).toBe("ACCEPTED"); // resting — not marketable at 200
    expect(order.reservedCash.toString()).toBe("1900.00"); // limit x qty
    expect(await cashOf(account.id)).toBe("100000.00"); // reservation is not a cash movement

    // Market crosses the limit.
    getContainer().fixtureProvider!.setPrice("AAPL", "189.5000");
    await getContainer().deterministicBroker!.tick();

    order = await getOrder(placed.order.id);
    expect(order.state).toBe("FILLED");
    expect(order.reservedCash.toString()).toBe("0.00");
    const pos = await positionOf(account.id, "AAPL");
    expect(pos!.qty).toBe(10n);
    // Filled at min(market ask, limit) <= limit.
    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, order.id));
    expect(Number(fills[0]!.price)).toBeLessThanOrEqual(190);
  });

  it("limit cancel: reservation released, CANCELLED (slice B-ii)", async () => {
    const { userId, account } = await newUserAccount("cancel@example.com");
    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: 10,
      limitPrice: "190.0000",
    });

    const c = getContainer();
    await getDb().transaction((tx) =>
      c.ordersService.requestCancel(asTx(tx), placed.order.id, new Date()),
    );
    await c.executionService.requestVenueCancel(placed.order.id);

    const order = await getOrder(placed.order.id);
    expect(order.state).toBe("CANCELLED");
    expect(order.reservedCash.toString()).toBe("0.00");
    expect(await cashOf(account.id)).toBe("100000.00");

    // Buying power fully restored: a full-size order fits again.
    const second = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: 500,
      limitPrice: "199.0000",
    });
    expect((await getOrder(second.order.id)).state).toBe("ACCEPTED");
  });

  it("partial fills: reservation shrinks, remainder works, final fill completes (slice B-iii)", async () => {
    const { userId, account } = await newUserAccount("partial@example.com");
    getContainer().deterministicBroker!.configure({ chunkFills: 4 });

    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 10,
    });
    const order = await getOrder(placed.order.id);
    expect(order.state).toBe("FILLED");
    expect(order.filledQty.toString()).toBe("10");

    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, order.id));
    expect(fills.map((f) => f.qty)).toEqual([4n, 4n, 2n]);

    // Three TRADE entries (one per execution), all reconciled.
    const trades = await getDb()
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, account.id));
    expect(trades.filter((e) => e.entryType === "TRADE")).toHaveLength(3);
    const rec = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(rec.inBalance).toBe(true);
  });

  it("sell with share reservation: the 100/70/20 case (invariant 11)", async () => {
    const { userId, account } = await newUserAccount("sell@example.com");
    // Build a 100-share position.
    await place({ accountUserId: userId, symbol: "AAPL", side: "BUY", type: "MARKET", qty: 100 });

    // Open SELL LIMIT 70 (non-marketable at 200 -> limit 210).
    getContainer().deterministicBroker!.configure({ chunkFills: 20 });
    const sell = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "SELL",
      type: "LIMIT",
      qty: 70,
      limitPrice: "210.0000",
    });
    expect((await getOrder(sell.order.id)).state).toBe("ACCEPTED");

    // sellable = 100 - 70 = 30: selling 31 must be rejected with no order row.
    await expect(
      place({ accountUserId: userId, symbol: "AAPL", side: "SELL", type: "MARKET", qty: 31 }),
    ).rejects.toMatchObject({ subcode: "INSUFFICIENT_HOLDINGS" });

    // Price crosses; chunked fills: 20 then partial state, then completion.
    getContainer().fixtureProvider!.setPrice("AAPL", "211.0000");
    await getContainer().deterministicBroker!.tick();

    const done = await getOrder(sell.order.id);
    expect(done.state).toBe("FILLED");
    const pos = await positionOf(account.id, "AAPL");
    expect(pos!.qty).toBe(30n);

    // Realized proceeds recorded; ledger reconciles.
    const rec = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(rec.inBalance).toBe(true);
  });

  it("insufficient buying power rejects with no order row (validation, not REJECTED)", async () => {
    const { userId, account } = await newUserAccount("poor@example.com");
    await expect(
      place({ accountUserId: userId, symbol: "AAPL", side: "BUY", type: "MARKET", qty: 1000 }),
    ).rejects.toMatchObject({ subcode: "INSUFFICIENT_BUYING_POWER" });
    const orders = await getDb()
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.accountId, account.id));
    expect(orders).toHaveLength(0);
  });

  it("market-closed and stale-quote submissions become venue REJECTED (lifecycle, not validation)", async () => {
    const { userId } = await newUserAccount("closed@example.com");
    getContainer().fixtureProvider!.setMarketStatus("CLOSED");
    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 1,
    });
    const order = await getOrder(placed.order.id);
    expect(order.state).toBe("REJECTED");
    expect(order.rejectReason).toContain("market closed");
    expect(order.reservedCash.toString()).toBe("0.00");

    getContainer().fixtureProvider!.setMarketStatus("OPEN");
    getContainer().fixtureProvider!.setQuoteTimestamp(new Date(Date.now() - 60_000));
    const stale = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 1,
    });
    expect((await getOrder(stale.order.id)).rejectReason).toContain("stale");
  });

  it("duplicate broker events apply exactly once (invariants 10/15)", async () => {
    const { userId, account } = await newUserAccount("dup@example.com");
    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "MARKET",
      qty: 10,
    });
    const cashAfter = await cashOf(account.id);

    // Replay the venue's entire event log through the consumer (as a stream
    // reconnect with a nil cursor would).
    const snapshot = await getContainer().broker.getOrderByClientId("any", placed.order.id);
    for (const event of snapshot!.events) {
      await getContainer().executionService.onBrokerEvent(event);
    }

    expect(await cashOf(account.id)).toBe(cashAfter);
    const fills = await getDb()
      .select()
      .from(schema.fills)
      .where(eq(schema.fills.orderId, placed.order.id));
    expect(fills).toHaveLength(1);
    const rec = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(rec.inBalance).toBe(true);
  });

  it("concurrent buys cannot jointly exceed buying power (ADR-008)", async () => {
    const { userId, account } = await newUserAccount("race@example.com");
    // Each ~60k reserved; two cannot fit in 100k.
    const results = await Promise.allSettled([
      place({
        accountUserId: userId,
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        qty: 300,
        limitPrice: "200.0000",
      }),
      place({
        accountUserId: userId,
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        qty: 300,
        limitPrice: "200.0000",
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rec = await getDb().transaction((tx) =>
      getContainer().ledgerService.reconcile(asTx(tx), account.id),
    );
    expect(rec.inBalance).toBe(true);
  });

  it("concurrent same-key submissions produce one order (idempotency race)", async () => {
    const { userId } = await newUserAccount("samekey@example.com");
    const key = crypto.randomUUID();
    const results = await Promise.allSettled([
      place({
        accountUserId: userId,
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        qty: 5,
        limitPrice: "150.0000",
        idempotencyKey: key,
      }),
      place({
        accountUserId: userId,
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        qty: 5,
        limitPrice: "150.0000",
        idempotencyKey: key,
      }),
    ]);
    const ids = new Set(
      results
        .filter(
          (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof place>>> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value.order.id),
    );
    expect(ids.size).toBe(1);
  });

  it("DAY expiry releases the reservation (slice B-iv)", async () => {
    const { userId, account } = await newUserAccount("expiry@example.com");
    const placed = await place({
      accountUserId: userId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: 10,
      limitPrice: "150.0000",
    });
    await getContainer().deterministicBroker!.expireDayOrders();
    const order = await getOrder(placed.order.id);
    expect(order.state).toBe("EXPIRED");
    expect(order.reservedCash.toString()).toBe("0.00");
    expect(await cashOf(account.id)).toBe("100000.00");
  });
});
