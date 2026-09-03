import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Qty } from "@/core/money";
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/infra/db";
import { getContainer, resetContainerForTests } from "@/server/container";
import { getPortfolioHistory } from "@/server/api/portfolio";
import type { SessionInfo } from "@/server/session";
import { signupWithAccount, truncateAll } from "./helpers";

/** The history endpoint end-to-end against the deterministic venue. */

function historyRequest(range: string): Request {
  return new Request(`http://test/api/v1/portfolio/history?range=${range}`);
}

describe("portfolio history endpoint", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
  });
  afterAll(closeDb);

  it("returns a series whose live tail equals the current equity", async () => {
    const { userId, account } = await signupWithAccount("hist@example.com", "10000.00");
    const session: SessionInfo = { userId, email: "hist@example.com", name: "T" };
    const c = getContainer();

    // A minutes-old account clips the whole window (correctly — see the ALL
    // test); backdate creation so historical grid points survive. The ledger
    // is append-only, so early points honestly read zero cash.
    await getDb()
      .update(schema.accounts)
      .set({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60_000) })
      .where(eq(schema.accounts.id, account.id));

    const instrument = await c.instrumentService.getOrRegister("AAPL");
    const quote = await c.marketData.getQuote("AAPL");
    const placed = await c.ordersService.place({
      account,
      instrument,
      side: "BUY",
      type: "MARKET",
      qty: Qty.of(10),
      limitPrice: null,
      refPrice: quote.ask ?? quote.last,
      idempotencyKey: crypto.randomUUID(),
    });
    await c.executionService.submit(placed.order.id);

    const body = (await getPortfolioHistory(historyRequest("1M"), session)) as {
      range: string;
      resolvedRange: string;
      points: Array<{ t: string; value: string }>;
      change: { absolute: string; percent: string | null };
      asOf: string;
    };
    expect(body.range).toBe("1M");
    expect(body.points.length).toBeGreaterThan(1);
    // ascending timestamps
    for (let i = 1; i < body.points.length; i++) {
      expect(Date.parse(body.points[i]!.t)).toBeGreaterThan(Date.parse(body.points[i - 1]!.t));
    }
    // the live tail is exactly the portfolio view's equity — same instant
    const fresh = await c.accountService.getActiveForUser(userId);
    const view = await c.portfolioService.view(account.id, fresh!.cashBalance, new Date());
    expect(body.points.at(-1)!.value).toBe(view.summary.equity);
  });

  it("ALL resolves to a provider range and clips to the account's age", async () => {
    const { userId } = await signupWithAccount("hist-all@example.com", "5000.00");
    const session: SessionInfo = { userId, email: "hist-all@example.com", name: "T" };
    const body = (await getPortfolioHistory(historyRequest("ALL"), session)) as {
      resolvedRange: string;
      points: Array<{ t: string; value: string }>;
    };
    expect(["1W", "1M", "3M", "1Y", "5Y"]).toContain(body.resolvedRange);
    // a minutes-old account: history clips to creation, leaving the live
    // tail (and possibly the deposit event) — never a fabricated backfill
    expect(body.points.at(-1)!.value).toBe("5000.00");
    expect(body.points.length).toBeLessThanOrEqual(2);
  });

  it("rejects an unknown range", async () => {
    const { userId } = await signupWithAccount("hist-bad@example.com");
    const session: SessionInfo = { userId, email: "hist-bad@example.com", name: "T" };
    await expect(getPortfolioHistory(historyRequest("2W"), session)).rejects.toThrow();
  });
});

describe("logos route", () => {
  it("404s with no upstream configured (dev/CI hermetic) and on garbage symbols", async () => {
    const { getLogo } = await import("@/server/api/logos");
    expect((await getLogo("AAPL")).status).toBe(404);
    expect((await getLogo("../../etc/passwd")).status).toBe(404);
    expect((await getLogo("A".repeat(40))).status).toBe(404);
  });
});
