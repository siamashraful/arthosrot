import { describe, expect, it } from "vitest";
import { upstreamSymbol } from "./logos";

describe("upstreamSymbol", () => {
  it("hyphenates class-share tickers for the logo CDN", () => {
    expect(upstreamSymbol("BRK.B")).toBe("BRK-B");
    expect(upstreamSymbol("BF.B")).toBe("BF-B");
  });

  it("leaves ordinary tickers untouched", () => {
    expect(upstreamSymbol("AAPL")).toBe("AAPL");
  });
});
