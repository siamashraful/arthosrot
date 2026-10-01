import { describe, expect, it } from "vitest";
import { Px, Qty } from "../money";
import { describeTrade, formatFillPrice } from "./describe";

describe("trade descriptions", () => {
  it("shows the exact fill price as money, keeping only real sub-penny digits", () => {
    expect(formatFillPrice(Px.fromString("200.1000"))).toBe("$200.10");
    expect(formatFillPrice(Px.fromString("410.7052"))).toBe("$410.7052");
    expect(formatFillPrice(Px.fromString("12.5000"))).toBe("$12.50");
    expect(formatFillPrice(Px.fromString("1234.0000"))).toBe("$1,234.00");
  });

  it("reads as a sentence for both sides", () => {
    expect(describeTrade("BUY", Qty.of(10), "AAPL", Px.fromString("200.1000"))).toBe(
      "Bought 10 AAPL at $200.10",
    );
    expect(describeTrade("SELL", Qty.of(2), "MSFT", Px.fromString("410.7052"))).toBe(
      "Sold 2 MSFT at $410.7052",
    );
  });
});
