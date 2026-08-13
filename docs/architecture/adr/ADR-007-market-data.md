# ADR-007 — Market-data abstraction: Alpaca free IEX feed + fixtures; freshness split

**Status:** accepted (2026-08)

**Context:** The UI needs search, bid/ask/last quotes, and candles — free, legally usable, vendor-abstracted, and honest about limitations. Execution truth lives at the broker (ADR-006), not in display data.

**Options:** (a) Alpaca Market Data free (IEX feed); (b) Finnhub free (quotes/search; candles paid); (c) Twelve Data (800 req/day); (d) scraping/unofficial (rejected on legality/stability).

**Decision:** (a) behind a `MarketDataProvider` port (`search/getQuote/getCandles/getMarketStatus`), plus a deterministic `FixtureProvider` (default in dev/test) and a `CachedProvider` decorator (quotes 10s in-hours, candles 1h/24h, search 24h, status 60s; failures serve cached values flagged stale).

**Rationale:** One free provider covers all three needs with real-time (IEX) data and generous limits (200 req/min); alternatives split coverage across vendors. The port keeps it swappable; the **independence rule** (adapters share nothing beyond a credential helper) keeps Broker and MarketData separately replaceable.

**Freshness split (deliberate):** _display freshness_ (chips, warnings) is a UI concern; _execution eligibility_ belongs to the venue in deployed mode — stale display data warns but does not block submission, because the broker executes against its own market view. The DeterministicPaperBroker, being its own execution authority, retains strict staleness rejection. IEX-vs-execution price discrepancies are expected and shown separately, never explained away (LIMITATIONS.md).

**Consequences:** feed disclosure required in UI; cache protects rate limits and gives graceful degradation; fixtures make every scenario reproducible offline.

**Revisit when:** consolidated/real-time tape is needed (paid SIP) or Alpaca's free data terms change.
