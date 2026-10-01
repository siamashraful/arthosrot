import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/core/market-data";
import { Px } from "@/core/money";
import { closeDb } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { GET as moversGET } from "@/app/api/v1/browse/movers/route";
import { truncateAll } from "./helpers";

/**
 * Top movers (/api/v1/browse/movers) against the fixture feed: the universe
 * is the Top 100 (seed — no snapshot in a truncated DB) ∪ the sector
 * catalog; gainers/losers are ranked by exact percent, ≤ 5 each, with one
 * freshness chip and the change period ("today" / "last-session").
 */

interface Row {
  symbol: string;
  name: string;
  quote: { last: string; ts: string; dayChange: { absolute: string; percent: string } | null };
  dayChange: { absolute: string; percent: string } | null;
}
interface Movers {
  gainers: Row[];
  losers: Row[];
  period: string;
  asOf: string;
  market: { status: string; asOf: string };
  freshness: string | null;
  freshnessTs: string | null;
  source: string | null;
}

const PASSWORD = "correct horse 9";

async function cookie(email = "movers@example.com"): Promise<string> {
  await getAuth().api.signUpEmail({ body: { name: "T", email, password: PASSWORD } });
  const res = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function fetchMovers(c?: string): Promise<Response> {
  return moversGET(
    new Request("http://test.local/api/v1/browse/movers", { headers: c ? { cookie: c } : {} }),
  );
}

/** Move a fixture symbol to `ratio` × its previous close (4dp). */
async function moveTo(symbol: string, ratio: string): Promise<void> {
  const fixture = getContainer().fixtureProvider!;
  const { previousClose } = await fixture.getQuote(symbol);
  fixture.setPrice(symbol, previousClose!.toDecimal().mul(ratio).toFixed(4));
}

function quote(symbol: string, last: string, previousClose: string | null): Quote {
  return {
    symbol,
    bid: null,
    bidSize: null,
    ask: null,
    askSize: null,
    last: Px.fromString(last),
    ts: new Date(),
    source: "fixture",
    previousClose: previousClose ? Px.fromString(previousClose) : null,
  };
}

const pct = (r: Row) => Number(r.dayChange!.percent); // test-side ordering check only

beforeEach(async () => {
  await truncateAll();
  resetContainerForTests();
  getContainer().fixtureProvider!.setMarketStatus("OPEN");
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe("GET /api/v1/browse/movers", () => {
  it("requires a session (standard envelope)", async () => {
    const res = await fetchMovers();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED");
  });

  it("ranks the five biggest gainers and losers, biggest move first", async () => {
    await moveTo("AAPL", "1.30");
    await moveTo("KO", "0.70");
    const res = await fetchMovers(await cookie());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Movers;

    expect(body.gainers).toHaveLength(5);
    expect(body.losers).toHaveLength(5);
    expect(body.gainers[0]).toMatchObject({ symbol: "AAPL", name: "Apple" }); // curated name
    expect(body.gainers[0]!.dayChange!.percent).toBe("30.00");
    expect(body.losers[0]).toMatchObject({ symbol: "KO", name: "Coca-Cola" });
    expect(body.losers[0]!.dayChange!.percent).toBe("-30.00");

    expect(body.gainers.every((r) => pct(r) > 0)).toBe(true);
    expect(body.losers.every((r) => pct(r) < 0)).toBe(true);
    const g = body.gainers.map(pct);
    const l = body.losers.map(pct);
    expect(g).toEqual([...g].sort((a, b) => b - a));
    expect(l).toEqual([...l].sort((a, b) => a - b));

    // rows carry the serialized quote (strings) and its day change
    for (const r of [...body.gainers, ...body.losers]) {
      expect(r.quote.last).toMatch(/^\d+\.\d{4}$/);
      expect(r.dayChange).toEqual(r.quote.dayChange);
      expect(r.dayChange!.absolute).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(body.period).toBe("today");
    expect(body.market.status).toBe("OPEN");
    expect(body.freshness).toBe("live");
    expect(body.source).toBe("fixture");
    expect(typeof body.freshnessTs).toBe("string");
  });

  it("off-hours: the change is the last session's, the chip reads at-close", async () => {
    getContainer().fixtureProvider!.setMarketStatus("CLOSED");
    const body = (await (await fetchMovers(await cookie())).json()) as Movers;
    expect(body.period).toBe("last-session");
    expect(body.market.status).toBe("CLOSED");
    expect(body.freshness).toBe("at-close");
  });

  it("returns fewer than five when fewer qualify (unchanged and no-reference symbols skipped)", async () => {
    vi.spyOn(getContainer().marketData, "getQuotes").mockResolvedValue(
      new Map([
        ["AAPL", quote("AAPL", "105.0000", "100.0000")],
        ["MSFT", quote("MSFT", "101.0000", "100.0000")],
        ["KO", quote("KO", "99.0000", "100.0000")],
        ["NVDA", quote("NVDA", "100.0000", "100.0000")], // unchanged
        ["JPM", quote("JPM", "120.0000", null)], // no previous close
      ]),
    );
    const body = (await (await fetchMovers(await cookie())).json()) as Movers;
    expect(body.gainers.map((r) => r.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(body.losers.map((r) => r.symbol)).toEqual(["KO"]);
  });

  it("returns empty arrays (and no chip) when nothing moved", async () => {
    vi.spyOn(getContainer().marketData, "getQuotes").mockResolvedValue(
      new Map([["AAPL", quote("AAPL", "100.0000", "100.0000")]]),
    );
    const body = (await (await fetchMovers(await cookie())).json()) as Movers;
    expect(body.gainers).toEqual([]);
    expect(body.losers).toEqual([]);
    expect(body.freshness).toBeNull();
    expect(body.freshnessTs).toBeNull();
  });

  it("asks for the whole universe in one batched quote call (Top 100 ∪ sectors, deduped)", async () => {
    const spy = vi.spyOn(getContainer().marketData, "getQuotes");
    await fetchMovers(await cookie());
    expect(spy).toHaveBeenCalledTimes(1);
    const symbols = spy.mock.calls[0]![0];
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols.length).toBeGreaterThanOrEqual(100);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("KO");
  });
});
