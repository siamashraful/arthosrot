import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderUnavailableError } from "@/core/market-data";
import { closeDb, getDb, schema } from "@/infra/db";
import { watchlistsRepository } from "@/infra/db/repositories/watchlists";
import { asTx } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { addWatchlistItem } from "@/server/api/portfolio";
import { CANDLE_CONCURRENCY } from "@/server/api/watchlist-quotes";
import type { SessionInfo } from "@/server/session";
import { GET as watchlistQuotesGET } from "@/app/api/v1/watchlist/quotes/route";
import { truncateAll } from "./helpers";

/**
 * Watchlist quotes + sparklines (/api/v1/watchlist/quotes) against Postgres
 * and the fixture feed: owner-scoped, one quote batch, 1D closes thinned to
 * ≤ 40 points, and per-symbol isolation — a symbol without a quote or a
 * failed candle call degrades that row only, never the response.
 */

interface Body {
  items: Array<{
    symbol: string;
    quote: {
      last: string;
      dayChange: { absolute: string; percent: string } | null;
    } | null;
    sparkline: string[] | null;
  }>;
  period: string;
  market: { status: string; asOf: string };
  freshness: string | null;
  freshnessTs: string | null;
  source: string | null;
}

const PASSWORD = "correct horse 9";

async function user(email: string): Promise<{ session: SessionInfo; cookie: string }> {
  const created = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: PASSWORD },
  });
  const res = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return {
    session: { userId: created.user.id, email, name: "T" },
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
  };
}

async function watch(session: SessionInfo, ...symbols: string[]): Promise<void> {
  for (const symbol of symbols) {
    await addWatchlistItem(
      new Request("http://test", { method: "POST", body: JSON.stringify({ symbol }) }),
      session,
    );
  }
}

async function fetchQuotes(cookie?: string): Promise<Response> {
  return watchlistQuotesGET(
    new Request("http://test.local/api/v1/watchlist/quotes", {
      headers: cookie ? { cookie } : {},
    }),
  );
}

beforeEach(async () => {
  await truncateAll();
  resetContainerForTests();
  getContainer().fixtureProvider!.setMarketStatus("OPEN");
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe("GET /api/v1/watchlist/quotes", () => {
  it("requires a session", async () => {
    const res = await fetchQuotes();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED");
  });

  it("an empty watchlist is an empty list, not an error", async () => {
    const { cookie } = await user("empty@example.com");
    const res = await fetchQuotes(cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.items).toEqual([]);
    expect(body.freshness).toBeNull();
    expect(body.market.status).toBe("OPEN");
  });

  it("returns each symbol's quote with day change and a ≤ 40-point session sparkline", async () => {
    const { session, cookie } = await user("watch@example.com");
    await watch(session, "AAPL", "MSFT");
    const body = (await (await fetchQuotes(cookie)).json()) as Body;

    expect(body.items.map((i) => i.symbol).sort()).toEqual(["AAPL", "MSFT"]);
    const aapl = body.items.find((i) => i.symbol === "AAPL")!;
    expect(aapl.quote!.last).toBe("200.0000");
    expect(aapl.quote!.dayChange!.percent).toMatch(/^-?\d+\.\d{2}$/);
    // fixture 1D = 78 five-minute bars → thinned, ending at the latest close
    expect(aapl.sparkline!.length).toBeLessThanOrEqual(40);
    expect(aapl.sparkline!.length).toBeGreaterThanOrEqual(2);
    expect(aapl.sparkline!.every((v) => /^\d+\.\d{4}$/.test(v))).toBe(true);
    expect(aapl.sparkline!.at(-1)).toBe("200.0000");

    expect(body.period).toBe("today");
    expect(body.freshness).toBe("live");
    expect(body.source).toBe("fixture");
    expect(typeof body.freshnessTs).toBe("string");
  });

  it("a symbol the feed can't quote (delisted) comes back quote:null, sparkline:null", async () => {
    const { session, cookie } = await user("delisted@example.com");
    await watch(session, "AAPL");
    const [instrument] = await getDb()
      .insert(schema.instruments)
      .values({ symbol: "ZZDL", name: "Delisted Co", exchange: "NYSE", status: "INACTIVE" })
      .returning();
    const tx = asTx(getDb());
    const watchlistId = await watchlistsRepository.getOrCreateForUser(tx, session.userId);
    await watchlistsRepository.add(tx, watchlistId, instrument!.id);

    const res = await fetchQuotes(cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.items.find((i) => i.symbol === "ZZDL")).toEqual({
      symbol: "ZZDL",
      quote: null,
      sparkline: null,
    });
    expect(body.items.find((i) => i.symbol === "AAPL")!.quote).not.toBeNull();
  });

  it("a failed candle call costs only that row its sparkline", async () => {
    const { session, cookie } = await user("candles@example.com");
    await watch(session, "AAPL", "MSFT");
    const md = getContainer().marketData;
    const real = md.getCandles.bind(md);
    vi.spyOn(md, "getCandles").mockImplementation(async (symbol, range) => {
      if (symbol === "MSFT") throw new ProviderUnavailableError("bars timed out");
      return real(symbol, range);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await fetchQuotes(cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    const msft = body.items.find((i) => i.symbol === "MSFT")!;
    expect(msft.sparkline).toBeNull();
    expect(msft.quote).not.toBeNull(); // the price still shows
    expect(body.items.find((i) => i.symbol === "AAPL")!.sparkline).not.toBeNull();
  });

  it("batches quotes once and caps concurrent candle calls", async () => {
    const { session, cookie } = await user("many@example.com");
    const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "KO"];
    await watch(session, ...symbols);
    const md = getContainer().marketData;
    const quotesSpy = vi.spyOn(md, "getQuotes");
    const real = md.getCandles.bind(md);
    let inFlight = 0;
    let peak = 0;
    const candlesSpy = vi.spyOn(md, "getCandles").mockImplementation(async (symbol, range) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return real(symbol, range);
    });

    const body = (await (await fetchQuotes(cookie)).json()) as Body;
    expect(body.items).toHaveLength(10);
    expect(quotesSpy).toHaveBeenCalledTimes(1);
    expect(candlesSpy).toHaveBeenCalledTimes(10);
    expect(candlesSpy.mock.calls.every(([, range]) => range === "1D")).toBe(true);
    expect(peak).toBeLessThanOrEqual(CANDLE_CONCURRENCY);
    expect(peak).toBeGreaterThan(1); // actually parallel
  });

  it("only ever returns the caller's own watchlist", async () => {
    const alice = await user("alice@example.com");
    const bob = await user("bob@example.com");
    await watch(alice.session, "AAPL", "TSLA");
    await watch(bob.session, "MSFT");

    const forBob = (await (await fetchQuotes(bob.cookie)).json()) as Body;
    expect(forBob.items.map((i) => i.symbol)).toEqual(["MSFT"]);
    const forAlice = (await (await fetchQuotes(alice.cookie)).json()) as Body;
    expect(forAlice.items.map((i) => i.symbol).sort()).toEqual(["AAPL", "TSLA"]);
  });
});
