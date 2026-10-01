import {
  marketStatusAt,
  ProviderUnavailableError,
  UnknownSymbolError,
  type Candle,
  type CandleRange,
  type InstrumentSummary,
  type MarketDataProvider,
  type MarketStatus,
  type Quote,
} from "@/core/market-data";
import { Px } from "@/core/money";
import type { Clock } from "@/core/shared";

/**
 * Alpaca Market Data (free IEX feed) adapter. Vendor payload shapes never
 * leave this file (docs/architecture/MODULE_BOUNDARIES.md rule 4).
 *
 * Feed reality (docs/LIMITATIONS.md): IEX-only, ~2–3% of US volume; prices
 * can differ from the consolidated tape and from venue execution references.
 */

const BASE_URL = "https://data.alpaca.markets";

// Vendor wire shapes (numbers arrive as JSON numbers here; prices re-serialized
// through Px immediately).
interface AlpacaLatestQuote {
  bp: number; // bid price
  bs: number; // bid size
  ap: number; // ask price
  as: number; // ask size
  t: string; // RFC3339 timestamp
}
interface AlpacaLatestTrade {
  p: number; // price
  t: string;
}
interface AlpacaSnapshot {
  latestTrade?: AlpacaLatestTrade | null;
  latestQuote?: AlpacaLatestQuote | null;
  dailyBar?: AlpacaBar | null;
  prevDailyBar?: AlpacaBar | null;
}
interface AlpacaBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string;
}

const RANGE_TO_REQUEST: Record<CandleRange, { timeframe: string; lookbackMs: number }> = {
  // 1D is the most recent SESSION, not the last 24 hours: a 24h window on a
  // weekend or a Monday morning holds no bars (the feed answers `bars: {}`),
  // which surfaced as "chart unavailable". Fetch far enough back to span a
  // long weekend, then keep only the latest session (lastSession below).
  "1D": { timeframe: "5Min", lookbackMs: 6 * 24 * 60 * 60_000 },
  "1W": { timeframe: "1Hour", lookbackMs: 7 * 24 * 60 * 60_000 },
  "1M": { timeframe: "1Day", lookbackMs: 31 * 24 * 60 * 60_000 },
  "3M": { timeframe: "1Day", lookbackMs: 93 * 24 * 60 * 60_000 },
  "1Y": { timeframe: "1Day", lookbackMs: 366 * 24 * 60 * 60_000 },
  "5Y": { timeframe: "1Week", lookbackMs: 5 * 366 * 24 * 60 * 60_000 },
};

const etDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

/** Symbols per snapshot request — comfortably inside URL-length limits. */
const SNAPSHOT_BATCH = 200;

/**
 * The close "day change" is measured against: the session BEFORE the one the
 * last trade belongs to. Normally that's prevDailyBar; but pre-market on a new
 * day the latest trade is already past dailyBar's date, so dailyBar itself is
 * the previous session.
 */
function referenceClose(snap: AlpacaSnapshot): number | null {
  const trade = snap.latestTrade;
  const daily = snap.dailyBar;
  if (trade && daily && etDate.format(new Date(trade.t)) > etDate.format(new Date(daily.t))) {
    return daily.c;
  }
  return snap.prevDailyBar?.c ?? null;
}

/** The bars of the latest US-Eastern trading date present (bars are ascending). */
function lastSession(bars: AlpacaBar[]): AlpacaBar[] {
  const last = bars.at(-1);
  if (!last) return bars;
  const day = etDate.format(new Date(last.t));
  return bars.filter((b) => etDate.format(new Date(b.t)) === day);
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function px(n: number): Px {
  return Px.fromString(n.toFixed(4));
}

export class AlpacaMarketData implements MarketDataProvider {
  constructor(
    private readonly clock: Clock,
    private readonly keyId: string,
    private readonly secret: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {}

  private async request<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${BASE_URL}${path}`, {
        headers: {
          "APCA-API-KEY-ID": this.keyId,
          "APCA-API-SECRET-KEY": this.secret,
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new ProviderUnavailableError("market-data request failed", err);
    }
    if (res.status === 404) throw new UnknownSymbolError(path);
    if (!res.ok) {
      throw new ProviderUnavailableError(`market-data request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /** The IEX data API has no name-search endpoint; instrument search is DB-backed. */
  async search(_query: string): Promise<InstrumentSummary[]> {
    return [];
  }

  async getQuote(symbol: string): Promise<Quote> {
    const map = await this.getQuotes([symbol]);
    const quote = map.get(symbol.toUpperCase());
    if (!quote) throw new UnknownSymbolError(symbol);
    return quote;
  }

  /**
   * One snapshot call per batch (latest quote + latest trade + daily bars) —
   * it replaced two calls (quotes/latest + trades/latest) and also carries
   * the previous session's close for day change. Symbols the feed doesn't
   * know are simply absent from the response.
   */
  async getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    const upper = [...new Set(symbols.map((s) => s.toUpperCase()))];
    for (let i = 0; i < upper.length; i += SNAPSHOT_BATCH) {
      const list = upper.slice(i, i + SNAPSHOT_BATCH).join(",");
      const snapshots = await this.request<Record<string, AlpacaSnapshot | null>>(
        `/v2/stocks/snapshots?symbols=${encodeURIComponent(list)}&feed=iex`,
      );
      for (const [symbol, snap] of Object.entries(snapshots ?? {})) {
        const trade = snap?.latestTrade;
        // A quote needs a positive last price AND a real timestamp (freshness
        // is derived from it) — a malformed trade is "no quote", not a crash.
        const ts = trade ? new Date(trade.t) : null;
        if (!snap || !trade || !(trade.p > 0) || !ts || Number.isNaN(ts.getTime())) continue;
        const q = snap.latestQuote;
        const reference = referenceClose(snap);
        out.set(symbol, {
          symbol,
          bid: q && q.bp > 0 ? px(q.bp) : null,
          bidSize: q && q.bp > 0 ? q.bs : null,
          ask: q && q.ap > 0 ? px(q.ap) : null,
          askSize: q && q.ap > 0 ? q.as : null,
          last: px(trade.p),
          ts,
          source: "IEX via Alpaca",
          previousClose: reference !== null && reference > 0 ? px(reference) : null,
        });
      }
    }
    return out;
  }

  async getCandles(symbol: string, range: CandleRange): Promise<Candle[]> {
    const { timeframe, lookbackMs } = RANGE_TO_REQUEST[range];
    const sym = symbol.toUpperCase();
    const start = new Date(this.clock.now().getTime() - lookbackMs).toISOString();
    const data = await this.request<{ bars: Record<string, AlpacaBar[]> }>(
      `/v2/stocks/bars?symbols=${encodeURIComponent(sym)}&timeframe=${timeframe}&start=${encodeURIComponent(start)}&limit=1000&adjustment=split&feed=iex&sort=asc`,
    );
    const all = data.bars?.[sym];
    if (!all) throw new UnknownSymbolError(symbol);
    const bars = range === "1D" ? lastSession(all) : all;
    return bars.map((b) => ({
      time: new Date(b.t).toISOString(),
      open: b.o.toFixed(4),
      high: b.h.toFixed(4),
      low: b.l.toFixed(4),
      close: b.c.toFixed(4),
      volume: b.v,
    }));
  }

  /**
   * Calendar approximation (holidays unmodeled — documented). The venue is the
   * execution authority, so a mislabeled holiday costs a status chip, not money.
   */
  async getMarketStatus(): Promise<{ status: MarketStatus; asOf: Date }> {
    const asOf = this.clock.now();
    return { status: marketStatusAt(asOf), asOf };
  }
}
