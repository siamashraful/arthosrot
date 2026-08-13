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
interface AlpacaBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string;
}

const RANGE_TO_REQUEST: Record<CandleRange, { timeframe: string; lookbackMs: number }> = {
  "1D": { timeframe: "5Min", lookbackMs: 1 * 24 * 60 * 60_000 },
  "1W": { timeframe: "1Hour", lookbackMs: 7 * 24 * 60 * 60_000 },
  "1M": { timeframe: "1Day", lookbackMs: 31 * 24 * 60 * 60_000 },
  "3M": { timeframe: "1Day", lookbackMs: 93 * 24 * 60 * 60_000 },
  "1Y": { timeframe: "1Day", lookbackMs: 366 * 24 * 60 * 60_000 },
  "5Y": { timeframe: "1Week", lookbackMs: 5 * 366 * 24 * 60 * 60_000 },
};

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

  async getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>> {
    const list = symbols.map((s) => s.toUpperCase()).join(",");
    const [quotes, trades] = await Promise.all([
      this.request<{ quotes: Record<string, AlpacaLatestQuote> }>(
        `/v2/stocks/quotes/latest?symbols=${encodeURIComponent(list)}&feed=iex`,
      ),
      this.request<{ trades: Record<string, AlpacaLatestTrade> }>(
        `/v2/stocks/trades/latest?symbols=${encodeURIComponent(list)}&feed=iex`,
      ),
    ]);
    const out = new Map<string, Quote>();
    for (const symbol of Object.keys(trades.trades ?? {})) {
      const trade = trades.trades[symbol];
      if (!trade || trade.p <= 0) continue;
      const q = quotes.quotes?.[symbol];
      out.set(symbol, {
        symbol,
        bid: q && q.bp > 0 ? px(q.bp) : null,
        bidSize: q && q.bp > 0 ? q.bs : null,
        ask: q && q.ap > 0 ? px(q.ap) : null,
        askSize: q && q.ap > 0 ? q.as : null,
        last: px(trade.p),
        ts: new Date(trade.t),
        source: "IEX via Alpaca",
      });
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
    const bars = data.bars?.[sym];
    if (!bars) throw new UnknownSymbolError(symbol);
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
