/**
 * core/market-data — MarketDataProvider port, quote/candle types, freshness
 * rules, and the market-calendar approximation (ADR-007).
 */
export {
  ProviderUnavailableError,
  UnknownSymbolError,
  type Candle,
  type CandleRange,
  type InstrumentSummary,
  type MarketDataProvider,
  type MarketStatus,
  type Quote,
} from "./types";
export {
  DISPLAY_AGING_MS,
  DISPLAY_STALE_MS,
  displayFreshness,
  EXECUTION_MAX_QUOTE_AGE_MS,
  isFreshEnoughForExecution,
  marketStatusAt,
  quoteAgeMs,
  type DisplayFreshness,
} from "./freshness";
