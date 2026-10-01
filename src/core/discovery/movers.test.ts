import { describe, expect, it } from "vitest";
import { compareDecimal, rankMovers } from "./movers";

const c = (symbol: string, percent: string) => ({ symbol, percent });

describe("compareDecimal", () => {
  it("compares exactly across signs and precisions", () => {
    expect(compareDecimal("1.10", "1.09")).toBe(1);
    expect(compareDecimal("-1.10", "-1.09")).toBe(-1);
    expect(compareDecimal("0.00", "0")).toBe(0);
    expect(compareDecimal("2", "10.00")).toBe(-1);
    expect(compareDecimal("0.1", "0.10")).toBe(0);
    // a float compare would call these equal
    expect(compareDecimal("0.30000000000000001", "0.3")).toBe(1);
  });

  it("refuses non-decimal input", () => {
    expect(() => compareDecimal("abc", "1")).toThrow(/invalid decimal/);
    expect(() => compareDecimal("1e3", "1")).toThrow(/invalid decimal/);
  });
});

describe("rankMovers", () => {
  const universe = [
    c("AAA", "1.20"),
    c("BBB", "-3.40"),
    c("CCC", "7.05"),
    c("DDD", "0.00"),
    c("EEE", "-0.01"),
    c("FFF", "2.50"),
    c("GGG", "12.00"),
    c("HHH", "-9.99"),
    c("III", "0.01"),
    c("JJJ", "3.00"),
    c("KKK", "-1.00"),
    c("LLL", "-12.50"),
    c("MMM", "-2.00"),
  ];

  it("takes the five biggest gainers, biggest first", () => {
    const { gainers } = rankMovers(universe);
    expect(gainers.map((g) => g.symbol)).toEqual(["GGG", "CCC", "JJJ", "FFF", "AAA"]);
  });

  it("takes the five biggest losers, biggest drop first", () => {
    const { losers } = rankMovers(universe);
    expect(losers.map((l) => l.symbol)).toEqual(["LLL", "HHH", "BBB", "MMM", "KKK"]);
  });

  it("never lists an unchanged symbol on either side", () => {
    const { gainers, losers } = rankMovers([c("FLAT", "0.00"), c("ZERO", "0")]);
    expect(gainers).toEqual([]);
    expect(losers).toEqual([]);
  });

  it("returns fewer than five when fewer qualify", () => {
    const { gainers, losers } = rankMovers([c("UP", "0.50"), c("DN", "-0.25"), c("UP2", "4.00")]);
    expect(gainers.map((g) => g.symbol)).toEqual(["UP2", "UP"]);
    expect(losers.map((l) => l.symbol)).toEqual(["DN"]);
  });

  it("returns empty arrays for an empty universe", () => {
    expect(rankMovers([])).toEqual({ gainers: [], losers: [] });
  });

  it("breaks ties by symbol and de-duplicates", () => {
    const { gainers } = rankMovers([c("ZZZ", "5.00"), c("AAA", "5.00"), c("AAA", "1.00")]);
    expect(gainers.map((g) => `${g.symbol}:${g.percent}`)).toEqual(["AAA:5.00", "ZZZ:5.00"]);
  });

  it("orders by exact decimal value, not string or float order", () => {
    const { gainers } = rankMovers([c("A", "9.99"), c("B", "10.00"), c("C", "10.01")]);
    expect(gainers.map((g) => g.symbol)).toEqual(["C", "B", "A"]);
  });

  it("keeps the caller's row shape", () => {
    const { gainers } = rankMovers([{ symbol: "X", percent: "1.00", name: "Ex" }]);
    expect(gainers[0]?.name).toBe("Ex");
  });

  it("honours a custom limit", () => {
    expect(rankMovers(universe, 2).gainers.map((g) => g.symbol)).toEqual(["GGG", "CCC"]);
  });
});
