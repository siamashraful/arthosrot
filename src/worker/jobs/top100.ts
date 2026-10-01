import {
  displayCompanyName,
  isDepositaryReceipt,
  rankByMarketCap,
  SHARE_OVERRIDES,
  TOP100_LIST,
  validateSnapshot,
  type MarketCapRankingStore,
  type SharesOutstandingSource,
} from "@/core/discovery";
import type { Quote } from "@/core/market-data";
import type { Px } from "@/core/money";
import { env } from "@/env";
import { listActiveInstruments } from "@/infra/db/repositories/instruments";
import { marketCapRankings } from "@/infra/db/repositories/market-cap-rankings";
import { companyFundamentals, type SharesRow } from "@/infra/db/repositories/company-fundamentals";
import { AlpacaMarketData } from "@/infra/market-data";
import { SecEdgarShares } from "@/infra/sec-edgar";
import { systemClock } from "@/core/shared";
import { parseDuration } from "./duration";
import { defineJob } from "./registry";

export const TOP100_JOB = "top-100-market-cap";

export interface Top100Deps {
  shares: SharesOutstandingSource;
  quotes: (symbols: string[]) => Promise<Map<string, Quote>>;
  activeInstruments: () => Promise<Array<{ symbol: string; name: string }>>;
  store: MarketCapRankingStore;
  /** Persist every valued company's share count (key stats: market cap). */
  saveShares?: (rows: SharesRow[]) => Promise<void>;
  now: () => Date;
}

const OVERRIDE_STALE_MS = 200 * 86_400_000;

/**
 * Recompute the Top 100: SEC share counts × latest IEX prices, ranked, then
 * validated against the previous snapshot. A refused run throws — the job
 * records the error and the previous snapshot stays live.
 */
export async function refreshTop100(deps: Top100Deps) {
  const now = deps.now();
  const [shareCounts, instruments] = await Promise.all([
    deps.shares.listShareCounts(now),
    deps.activeInstruments(),
  ]);
  const eligible = new Set(
    instruments.filter((i) => !isDepositaryReceipt(i.name)).map((i) => i.symbol),
  );
  // Price every listed class we could value, plus each override's symbol.
  const overrideCiks = new Set(SHARE_OVERRIDES.map((o) => o.cik));
  const symbols = [
    ...new Set([
      ...shareCounts
        .filter((sc) => sc.shares && !overrideCiks.has(sc.cik))
        .flatMap((sc) => sc.tickers.filter((t) => eligible.has(t))),
      ...SHARE_OVERRIDES.flatMap((o) => ("displaySymbol" in o ? [o.displaySymbol] : [])),
    ]),
  ];
  const quotes = await deps.quotes(symbols);
  const prices = new Map<string, Px>([...quotes].map(([s, q]) => [s, q.last]));

  const { ranked, rejected, missing } = await rankByMarketCap({
    shareCounts,
    eligible,
    prices,
    overrides: SHARE_OVERRIDES,
    industryCode: (cik) => deps.shares.industryCode(cik),
  });
  // Share counts for the instrument page's market cap: every company we can
  // value (not just the top 100), minus anything the float check rejected.
  // Written before the ranking's own validation — a refused ranking is about
  // prices and the top 10, not about these per-company counts.
  if (deps.saveShares) {
    const rejectedSymbols = new Set(rejected.map((r) => r.symbol));
    const rows: SharesRow[] = [];
    for (const sc of shareCounts) {
      if (!sc.shares || overrideCiks.has(sc.cik)) continue;
      const tickers = sc.tickers.filter((t) => eligible.has(t));
      if (tickers.some((t) => rejectedSymbols.has(t))) continue;
      for (const symbol of tickers) {
        rows.push({
          symbol,
          cik: sc.cik,
          name: displayCompanyName(sc.name),
          shares: sc.shares.toString(),
          sharesAsOf: sc.asOf,
          sharesBasis: sc.basis,
        });
      }
    }
    for (const o of SHARE_OVERRIDES) {
      if (!("displaySymbol" in o) || !eligible.has(o.displaySymbol)) continue;
      rows.push({
        symbol: o.displaySymbol,
        cik: o.cik,
        name: o.name,
        shares: o.shares,
        sharesAsOf: o.asOf,
        sharesBasis: "override",
      });
    }
    await deps.saveShares(rows);
  }

  const previous = await deps.store.latest(TOP100_LIST);
  const verdict = validateSnapshot(previous?.entries ?? null, ranked, {
    candidates: symbols.length,
    priced: prices.size,
  });
  if (!verdict.ok) throw new Error(`top-100 snapshot refused: ${verdict.reason}`);

  await deps.store.save({
    list: TOP100_LIST,
    asOf: now,
    source: "SEC EDGAR shares outstanding × IEX last price",
    entries: ranked.map((r) => ({
      rank: r.rank,
      cik: r.cik,
      symbol: r.symbol,
      name: displayCompanyName(r.name),
      shares: r.shares.toString(),
      price: r.price.toString(),
      marketCap: r.marketCap.toString(),
    })),
  });
  if (rejected.length > 0 || missing.length > 0) {
    // Not fatal: rejected = a filer's share data contradicts its own public
    // float (mis-scaled XBRL); missing = a large filer we can't value yet —
    // both are maintenance prompts for SHARE_OVERRIDES.
    console.warn(JSON.stringify({ level: "warn", msg: "top-100 data gaps", rejected, missing }));
  }
  const staleOverrides = SHARE_OVERRIDES.filter(
    (o) => now.getTime() - Date.parse(o.asOf) > OVERRIDE_STALE_MS,
  ).map((o) => o.name);
  if (staleOverrides.length > 0) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "share overrides need a refresh", staleOverrides }),
    );
  }
  return {
    candidates: symbols.length,
    priced: prices.size,
    top5: ranked.slice(0, 5).map((r) => r.symbol),
    rejected: rejected.length,
    missing: missing.map((m) => m.name),
  };
}

/** The production wiring: SEC + the uncached Alpaca feed + Postgres. */
export function top100Job() {
  const e = env();
  return defineJob({
    name: TOP100_JOB,
    intervalMs: parseDuration(e.TOP100_REFRESH_INTERVAL),
    leaseMs: 20 * 60_000,
    enabled: () =>
      Boolean(
        e.SEC_USER_AGENT &&
        e.MARKET_DATA_PROVIDER === "alpaca" &&
        e.ALPACA_DATA_KEY &&
        e.ALPACA_DATA_SECRET,
      ),
    run: () => {
      // Uncached on purpose: ~4k symbols once a day would only churn the
      // shared quote cache the UI relies on.
      const feed = new AlpacaMarketData(systemClock, e.ALPACA_DATA_KEY!, e.ALPACA_DATA_SECRET!);
      return refreshTop100({
        shares: new SecEdgarShares(e.SEC_USER_AGENT!),
        quotes: (symbols) => feed.getQuotes(symbols),
        activeInstruments: listActiveInstruments,
        store: marketCapRankings,
        saveShares: (rows) => companyFundamentals.upsertShares(rows),
        now: () => systemClock.now(),
      });
    },
  });
}
