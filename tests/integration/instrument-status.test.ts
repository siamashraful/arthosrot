import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Qty } from "@/core/money";
import { closeDb, getDb, schema } from "@/infra/db";
import { instrumentsRepository } from "@/infra/db/repositories/instruments";
import { asTx } from "@/infra/db/tx";
import { getContainer, resetContainerForTests } from "@/server/container";
import { signupWithAccount, truncateAll } from "./helpers";

/**
 * Delisted-instrument policy (review findings): INACTIVE symbols are hidden
 * from search and refuse BUYs, but holders ALWAYS keep their exit — SELLs are
 * accepted, and re-listing or a provider vouching for the symbol reactivates
 * it (INACTIVE is never a one-way trap).
 */

async function markInactive(symbol: string): Promise<void> {
  await getDb()
    .update(schema.instruments)
    .set({ status: "INACTIVE" })
    .where(eq(schema.instruments.symbol, symbol));
}

describe("delisted instruments", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
  });
  afterAll(closeDb);

  it("refuses BUYs on INACTIVE instruments (422, no order row) but accepts SELLs", async () => {
    const { account } = await signupWithAccount("delist@example.com");
    const c = getContainer();
    const instrument = await c.instrumentService.getOrRegister("AAPL");
    const quote = await c.marketData.getQuote("AAPL");

    // Establish a holding while the symbol is still active.
    const buy = await c.ordersService.place({
      account,
      instrument,
      side: "BUY",
      type: "MARKET",
      qty: Qty.of(10),
      limitPrice: null,
      refPrice: quote.ask ?? quote.last,
      idempotencyKey: crypto.randomUUID(),
    });
    await c.executionService.submit(buy.order.id);

    await markInactive("AAPL");
    const delisted = { ...instrument, status: "INACTIVE" };

    await expect(
      c.ordersService.place({
        account,
        instrument: delisted,
        side: "BUY",
        type: "LIMIT",
        qty: Qty.of(1),
        limitPrice: quote.last,
        refPrice: null,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", subcode: "INSTRUMENT_INACTIVE" });

    // The exit stays open: a SELL of the held shares is accepted.
    const sell = await c.ordersService.place({
      account,
      instrument: delisted,
      side: "SELL",
      type: "LIMIT",
      qty: Qty.of(5),
      limitPrice: quote.last,
      refPrice: null,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(sell.order.side).toBe("SELL");
  });

  it("search hides INACTIVE symbols; a provider-vouched upsert reactivates them", async () => {
    await signupWithAccount("react@example.com");
    const c = getContainer();
    await c.instrumentService.getOrRegister("AAPL");
    await markInactive("AAPL");

    // DB-level search hides it (the provider supplement is what reactivates).
    const hidden = await getDb().transaction((tx) =>
      instrumentsRepository.search(asTx(tx), "AAPL", 10),
    );
    expect(hidden.find((i) => i.symbol === "AAPL")).toBeUndefined();

    // The fixture provider's search vouches for AAPL -> upsert reactivates —
    // INACTIVE is sync-owned state, never a one-way trap.
    const found = await c.instrumentService.search("Apple");
    expect(found.find((i) => i.symbol === "AAPL")?.status).toBe("ACTIVE");
  });
});
