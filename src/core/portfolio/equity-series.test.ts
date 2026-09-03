import { describe, expect, it } from "vitest";
import { ProviderUnavailableError, type Candle } from "../market-data";
import { Money, percentChange, Qty } from "../money";
import { equitySeries, resolveAllRange } from "./equity-series";
import type { FillForReplay } from "./portfolio";

/**
 * The equity series is a financial derivation (core/portfolio) — these tests
 * pin the sampling rule (bar-END cutoff), window clipping, carry-forward
 * seeding, and the honesty failure (held symbol with no price throws).
 */

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-08-03T00:00:00.000Z"); // a Monday

function candle(startMs: number, close: string): Candle {
  return {
    time: new Date(startMs).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  };
}

function fill(side: "BUY" | "SELL", qty: number, notional: string, atMs: number): FillForReplay {
  return {
    instrumentId: "inst-1",
    symbol: "AAPL",
    side,
    qty: Qty.of(qty),
    notional: Money.fromString(notional),
    fee: Money.zero(),
    occurredAt: new Date(atMs),
  };
}

const deposit = (amount: string, atMs: number) => ({
  amount: Money.fromString(amount),
  createdAt: new Date(atMs),
});

describe("equitySeries", () => {
  it("cash-only account: flat line on the ledger-event grid plus the live tail", async () => {
    const now = new Date(T0 + 3 * DAY);
    const result = await equitySeries({
      range: "1M",
      fills: [],
      ledger: [deposit("10000.00", T0)],
      accountCreatedAt: new Date(T0),
      now,
      liveEquity: Money.fromString("10000.00"),
      getCandles: () => Promise.reject(new Error("must not fetch for cash-only")),
    });
    expect(result.points[0]!.value.toString()).toBe("10000.00");
    expect(result.points.at(-1)!.t.toISOString()).toBe(now.toISOString());
    expect(result.change.absolute.toString()).toBe("0.00");
    expect(result.change.percent).toBe("0.00");
  });

  it("samples holdings at the bar END: a fill during the bar is valued at that bar's close", async () => {
    // Daily candles for day0..day2; the buy happens MIDDAY day0. With the
    // naive <= barStart rule the day0 point would exclude the position.
    const candles = [
      candle(T0, "100.0000"),
      candle(T0 + DAY, "110.0000"),
      candle(T0 + 2 * DAY, "105.0000"),
    ];
    const result = await equitySeries({
      range: "1M",
      fills: [fill("BUY", 10, "1000.00", T0 + DAY / 2)],
      ledger: [deposit("10000.00", T0), deposit("-1000.00", T0 + DAY / 2)],
      accountCreatedAt: new Date(T0),
      now: new Date(T0 + 3 * DAY),
      liveEquity: Money.fromString("10050.00"),
      getCandles: () => Promise.resolve(candles),
    });
    // day0 point: cash 9000 + 10 x 100 = 10000 (position INCLUDED, at day0 close)
    expect(result.points[0]!.value.toString()).toBe("10000.00");
    // day1 point: 9000 + 10 x 110 = 10100
    expect(result.points[1]!.value.toString()).toBe("10100.00");
    // live tail replaces nothing — appended after day2
    expect(result.points.at(-1)!.value.toString()).toBe("10050.00");
  });

  it("clips the series to the account's creation", async () => {
    const candles = [0, 1, 2, 3, 4].map((d) => candle(T0 + d * DAY, "100.0000"));
    const created = new Date(T0 + 2 * DAY + DAY / 2); // mid-day2
    const result = await equitySeries({
      range: "1M",
      fills: [fill("BUY", 1, "100.00", T0 + 3 * DAY)],
      ledger: [deposit("1000.00", created.getTime())],
      accountCreatedAt: created,
      now: new Date(T0 + 5 * DAY),
      liveEquity: Money.fromString("1000.00"),
      getCandles: () => Promise.resolve(candles),
    });
    // no point may end before the account existed
    for (const p of result.points) {
      expect(p.t.getTime()).toBeGreaterThan(created.getTime());
    }
  });

  it("carries the last known close across a candle gap (holiday)", async () => {
    // AAPL misses day2; MSFT provides the grid point. AAPL valued at carry.
    const aapl = [
      candle(T0, "100.0000"),
      candle(T0 + DAY, "110.0000"),
      candle(T0 + 3 * DAY, "120.0000"),
    ];
    const msft = [0, 1, 2, 3].map((d) => candle(T0 + d * DAY, "50.0000"));
    const fills: FillForReplay[] = [
      fill("BUY", 10, "1000.00", T0 + 60_000),
      {
        instrumentId: "inst-2",
        symbol: "MSFT",
        side: "BUY",
        qty: Qty.of(2),
        notional: Money.fromString("100.00"),
        fee: Money.zero(),
        occurredAt: new Date(T0 + 60_000),
      },
    ];
    const result = await equitySeries({
      range: "1M",
      fills,
      ledger: [deposit("10000.00", T0), deposit("-1100.00", T0 + 60_000)],
      accountCreatedAt: new Date(T0),
      now: new Date(T0 + 4 * DAY),
      liveEquity: Money.fromString("10200.00"),
      getCandles: (s) => Promise.resolve(s === "AAPL" ? aapl : msft),
    });
    // day2 (AAPL gap): cash 8900 + AAPL 10 x 110 (carry) + MSFT 2 x 50 = 10100
    const day2 = result.points.find((p) => p.t.getTime() === T0 + 3 * DAY)!;
    expect(day2.value.toString()).toBe("10100.00");
  });

  it("a sold-out symbol needs no price after the exit", async () => {
    // Sold on day1; AAPL candles END at day1 — days 2-3 come from MSFT only.
    const aapl = [candle(T0, "100.0000"), candle(T0 + DAY, "110.0000")];
    const msft = [0, 1, 2, 3].map((d) => candle(T0 + d * DAY, "50.0000"));
    const fills: FillForReplay[] = [
      fill("BUY", 10, "1000.00", T0 + 60_000),
      fill("SELL", 10, "1100.00", T0 + DAY + 60_000),
      {
        instrumentId: "inst-2",
        symbol: "MSFT",
        side: "BUY",
        qty: Qty.of(2),
        notional: Money.fromString("100.00"),
        fee: Money.zero(),
        occurredAt: new Date(T0 + 60_000),
      },
    ];
    const result = await equitySeries({
      range: "1M",
      fills,
      ledger: [
        deposit("10000.00", T0),
        deposit("-1100.00", T0 + 60_000),
        deposit("1100.00", T0 + DAY + 60_000),
      ],
      accountCreatedAt: new Date(T0),
      now: new Date(T0 + 4 * DAY),
      liveEquity: Money.fromString("10100.00"),
      getCandles: (s) => Promise.resolve(s === "AAPL" ? aapl : msft),
    });
    // day2: cash 10000 + MSFT 100 = 10100; AAPL 0 shares, no price needed
    const day2 = result.points.find((p) => p.t.getTime() === T0 + 3 * DAY)!;
    expect(day2.value.toString()).toBe("10100.00");
  });

  it("fails the WHOLE series when a held symbol has no candles (never fabricate)", async () => {
    await expect(
      equitySeries({
        range: "1M",
        fills: [fill("BUY", 10, "1000.00", T0)],
        ledger: [deposit("10000.00", T0)],
        accountCreatedAt: new Date(T0),
        now: new Date(T0 + DAY),
        liveEquity: Money.fromString("10000.00"),
        getCandles: () => Promise.resolve([]),
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("reports change from the first point to the live tail", async () => {
    const candles = [candle(T0, "100.0000")];
    const result = await equitySeries({
      range: "1M",
      fills: [fill("BUY", 10, "1000.00", T0 + 60_000)],
      ledger: [deposit("10000.00", T0), deposit("-1000.00", T0 + 60_000)],
      accountCreatedAt: new Date(T0),
      // just past the bar end — the live tail APPENDS (at exactly the bar
      // end it would correctly replace the bar's own point instead)
      now: new Date(T0 + DAY + 60_000),
      liveEquity: Money.fromString("10410.00"),
      getCandles: () => Promise.resolve(candles),
    });
    expect(result.change.absolute.toString()).toBe("410.00");
    expect(result.change.percent).toBe("4.10");
  });
});

describe("resolveAllRange", () => {
  const now = new Date("2026-08-27T00:00:00Z");
  it("picks the smallest provider range covering the account age", () => {
    expect(resolveAllRange(new Date(now.getTime() - 3 * DAY), now)).toBe("1W");
    expect(resolveAllRange(new Date(now.getTime() - 20 * DAY), now)).toBe("1M");
    expect(resolveAllRange(new Date(now.getTime() - 200 * DAY), now)).toBe("1Y");
  });
});

describe("percentChange", () => {
  it("is null on a non-positive base and 2dp HALF_EVEN otherwise", () => {
    expect(percentChange(Money.zero(), Money.fromString("100.00"))).toBeNull();
    expect(percentChange(Money.fromString("200.00"), Money.fromString("150.00"))).toBe("-25.00");
    expect(percentChange(Money.fromString("10000.00"), Money.fromString("10412.50"))).toBe("4.12"); // 4.125 HALF_EVEN
  });
});
