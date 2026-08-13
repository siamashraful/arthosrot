import type { Px } from "../money";

export type MarketStatus = "OPEN" | "CLOSED" | "PRE" | "POST";

export interface Quote {
  symbol: string;
  /** Best bid/ask where the feed provides them (IEX does); absent on fixtures without depth. */
  bid: Px | null;
  bidSize: number | null;
  ask: Px | null;
  askSize: number | null;
  last: Px;
  /** Timestamp of the last observation — a Quote without a timestamp cannot exist. */
  ts: Date;
  /** Feed identity for disclosure, e.g. "IEX via Alpaca" or "fixture". */
  source: string;
}

export interface Candle {
  /** Bar start, ISO-8601 UTC. */
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
}

export type CandleRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

export interface InstrumentSummary {
  symbol: string;
  name: string;
  exchange: string;
}

export interface MarketDataProvider {
  /**
   * Provider-side symbol search. May legitimately return [] (the Alpaca data
   * feed has no name-search endpoint) — instrument search is DB-backed and
   * this supplements it (docs/architecture/INTEGRATIONS.md).
   */
  search(query: string): Promise<InstrumentSummary[]>;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>>;
  getCandles(symbol: string, range: CandleRange): Promise<Candle[]>;
  getMarketStatus(): Promise<{ status: MarketStatus; asOf: Date }>;
}

/** Raised when a symbol is unknown to the provider. */
export class UnknownSymbolError extends Error {
  constructor(symbol: string) {
    super(`unknown symbol: ${symbol}`);
    this.name = "UnknownSymbolError";
  }
}

/** Raised when the upstream provider fails or times out. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
