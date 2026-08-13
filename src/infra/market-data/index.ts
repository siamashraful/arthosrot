/**
 * infra/market-data — MarketDataProvider implementations (ADR-007):
 * fixture (deterministic, default offline), alpaca (IEX free feed), cached
 * (decorator). Vendor shapes are confined to alpaca.ts.
 */
export { FixtureProvider, DEFAULT_FIXTURES, type FixtureInstrument } from "./fixture";
export { AlpacaMarketData, type FetchFn } from "./alpaca";
export { CachedMarketData } from "./cached";
