import { describe, expect, it } from "vitest";
import { formatRealizedPnl, realizedInsightChip } from "./insight";

describe("Realized P&L insight", () => {
  it("chip follows the sign; zero is neutral", () => {
    expect(realizedInsightChip("12.50")).toEqual({ kind: "gain", icon: "trending-up" });
    expect(realizedInsightChip("-3.00")).toEqual({ kind: "loss", icon: "trending-down" });
    expect(realizedInsightChip("0.00").kind).toBe("neutral");
    expect(realizedInsightChip(undefined).kind).toBe("neutral");
  });
  it("value is signed when non-zero and plain at zero", () => {
    expect(formatRealizedPnl("1234.5")).toBe("+$1,234.50");
    expect(formatRealizedPnl("-3.00")).toBe("−$3.00");
    expect(formatRealizedPnl("0.00")).toBe("$0.00");
  });
});
