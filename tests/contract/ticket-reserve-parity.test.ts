import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Px, Qty, reserveWithBuffer as coreReserve } from "@/core/money";
import { reserveWithBuffer as ticketReserve, ticketPrecheck } from "@/lib/order-ticket";

/**
 * The ticket's market-buy reserve must equal what placement reserves (core
 * reserveWithBuffer), or the pre-check would pass orders the server refuses.
 */
describe("ticket reserve parity with core", () => {
  it("matches core exactly across prices, quantities and buffers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99_999_999 }), // price in ten-thousandths
        fc.integer({ min: 1, max: 5_000 }),
        fc.constantFrom("0", "0.025", "0.05", "0.1", "0.0125", "0.333"),
        (units, qty, buffer) => {
          const price = `${Math.floor(units / 10_000)}.${String(units % 10_000).padStart(4, "0")}`;
          const core = coreReserve(Px.fromString(price), Qty.of(qty), Number(buffer)).toString();
          expect(ticketReserve(price, qty, buffer)).toBe(core);
        },
      ),
    );
  });

  it("pre-check catches a market buy whose reserve exceeds buying power", () => {
    // 49 × $200.10 = $9,804.90 fits $10,000, but × 1.025 = $10,050.02 does not.
    const msg = ticketPrecheck({
      symbol: "AAPL",
      side: "BUY",
      qty: 49,
      estimate: "9804.90",
      buyingPower: "10000.00",
      sellable: "0",
      reserve: ticketReserve("200.1000", 49, "0.025"),
      buffer: "0.025",
    });
    expect(msg).toMatch(/hold 2\.5% above the ask/);
    expect(msg).toMatch(/\$10,050\.02/);
  });
});
