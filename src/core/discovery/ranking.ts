import { Money, notional, Qty, type Px } from "../money";

/**
 * Top-100-by-market-value ranking (docs/architecture/INTEGRATIONS.md, SEC
 * EDGAR). Pure: the job gathers share counts, eligible symbols and prices,
 * this decides the list. Market value = shares outstanding × last price —
 * a display ranking, never an input to execution or the ledger.
 */

/** One SEC filer's share count, as the shares source reports it. */
export interface ShareCount {
  /** SEC Central Index Key, unpadded ("320193"). */
  cik: string;
  name: string;
  /** Listed common-share tickers in our symbol form ("BRK.B"), preferred first. */
  tickers: string[];
  /** null: the filer has no usable share count (multi-class tagging, …). */
  shares: Qty | null;
  /** Period end the count is as of (ISO date). */
  asOf: string;
  /** cover = cover-page shares outstanding; weighted-average = quarterly basic. */
  basis: "cover" | "weighted-average" | "none";
  /**
   * Market value of non-affiliate shares from the latest 10-K cover — an
   * independent dollar figure the computed market value is checked against.
   */
  publicFloat: Money | null;
}

/** Read port for share counts (infra/sec-edgar implements it). */
export interface SharesOutstandingSource {
  listShareCounts(now: Date): Promise<ShareCount[]>;
  /** SIC industry code for a filer, or null when unknown. */
  industryCode(cik: string): Promise<string | null>;
}

/**
 * A hand-maintained correction for a filer the bulk data gets wrong: either a
 * share count (multi-class filers the frames omit) or an exclusion (a filer
 * whose XBRL is mis-scaled everywhere, so no cross-check can catch it).
 */
export type ShareOverride =
  | { cik: string; name: string; displaySymbol: string; shares: string; asOf: string; note: string }
  | { cik: string; name: string; exclude: true; asOf: string; note: string };

export interface RankedCompany {
  rank: number;
  cik: string;
  symbol: string;
  name: string;
  shares: Qty;
  price: Px;
  marketCap: Money;
}

/**
 * SIC codes that are investment vehicles, not operating companies: commodity
 * and crypto trusts (GLD, SLV, IBIT file 10-Qs under 6221) and fund/trust
 * offices. They'd otherwise rank as "companies".
 */
export const EXCLUDED_SIC = new Set(["6221", "6722", "6726"]);

export interface RankInput {
  shareCounts: readonly ShareCount[];
  /** Symbols our instruments catalog lists as ACTIVE. */
  eligible: ReadonlySet<string>;
  prices: ReadonlyMap<string, Px>;
  overrides: readonly ShareOverride[];
  industryCode: (cik: string) => Promise<string | null>;
  size?: number;
}

/**
 * American depositary receipts are out of the universe: their filings count
 * ordinary shares while the listing trades depositary units (often N:1), so
 * shares × price misprices them — and they're foreign companies anyway.
 * Recognised by the catalog's instrument name.
 */
export function isDepositaryReceipt(instrumentName: string): boolean {
  return /\bADSs?\b|\bADRs?\b|depositary/i.test(instrumentName);
}

/** Computed value vs public float outside this band ⇒ a mis-scaled filing. */
const FLOAT_BAND = { min: 0.2, max: 25 } as const;
/** Filers this large without a share count are logged for an override. */
const MISSING_FLOAT_ALERT = Money.fromString("50000000000");

export interface RankResult {
  ranked: RankedCompany[];
  /** Implausible against public float — excluded, logged. */
  rejected: Array<{ symbol: string; name: string; marketCap: string; publicFloat: string }>;
  /** Large filers (public float ≥ $50B) we couldn't value — need an override. */
  missing: Array<{ cik: string; name: string; publicFloat: string }>;
}

export async function rankByMarketCap(input: RankInput): Promise<RankResult> {
  const size = input.size ?? 100;
  const overrides = new Map(input.overrides.map((o) => [o.cik, o]));
  const rejected: RankResult["rejected"] = [];
  const missing: RankResult["missing"] = [];

  // Overrides also add filers the bulk data omits entirely.
  const counts = new Map(input.shareCounts.map((sc) => [sc.cik, sc]));
  for (const o of input.overrides) {
    if (!counts.has(o.cik)) {
      counts.set(o.cik, {
        cik: o.cik,
        name: o.name,
        tickers: [],
        shares: null,
        asOf: o.asOf,
        basis: "none",
        publicFloat: null,
      });
    }
  }

  const candidates: Omit<RankedCompany, "rank">[] = [];
  for (const sc of counts.values()) {
    const override = overrides.get(sc.cik);
    if (override && "exclude" in override) continue;
    const symbol = override
      ? override.displaySymbol
      : sc.tickers.find((t) => input.eligible.has(t) && input.prices.has(t));
    const shares = override ? Qty.of(override.shares) : sc.shares;
    if (!shares || shares.isZero()) {
      if (sc.publicFloat?.gte(MISSING_FLOAT_ALERT)) {
        missing.push({ cik: sc.cik, name: sc.name, publicFloat: sc.publicFloat.toString() });
      }
      continue;
    }
    if (!symbol || !input.eligible.has(symbol)) continue;
    const price = input.prices.get(symbol);
    if (!price) continue;
    const marketCap = notional(price, shares);
    if (!override && sc.publicFloat && !withinFloatBand(marketCap, sc.publicFloat)) {
      rejected.push({
        symbol,
        name: sc.name,
        marketCap: marketCap.toString(),
        publicFloat: sc.publicFloat.toString(),
      });
      continue;
    }
    candidates.push({ cik: sc.cik, symbol, name: sc.name, shares, price, marketCap });
  }
  candidates.sort((a, b) => b.marketCap.compare(a.marketCap) || a.symbol.localeCompare(b.symbol));

  // Industry lookups only for the head of the list — one SEC call each.
  const out: RankedCompany[] = [];
  for (const c of candidates) {
    if (out.length >= size) break;
    const sic = await input.industryCode(c.cik);
    if (sic && EXCLUDED_SIC.has(sic)) continue;
    out.push({ ...c, rank: out.length + 1 });
  }
  return { ranked: out, rejected, missing };
}

function withinFloatBand(marketCap: Money, publicFloat: Money): boolean {
  if (publicFloat.isZero() || publicFloat.isNegative()) return false;
  const ratio = marketCap.toDecimal().div(publicFloat.toDecimal());
  return ratio.gte(FLOAT_BAND.min) && ratio.lte(FLOAT_BAND.max);
}

export type SnapshotVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Refuse to publish a degraded run — the previous snapshot stays live
 * (same spirit as db:sync-instruments refusing a degraded venue list).
 */
export function validateSnapshot(
  previous: readonly Pick<RankedCompany, "symbol">[] | null,
  next: readonly Pick<RankedCompany, "symbol">[],
  coverage: { candidates: number; priced: number },
  size = 100,
): SnapshotVerdict {
  if (next.length < size) {
    return { ok: false, reason: `only ${next.length} ranked companies (need ${size})` };
  }
  if (coverage.candidates === 0 || coverage.priced / coverage.candidates < 0.8) {
    return {
      ok: false,
      reason: `prices for only ${coverage.priced}/${coverage.candidates} candidates`,
    };
  }
  if (previous && previous.length >= 10) {
    const before = new Set(previous.slice(0, 10).map((r) => r.symbol));
    const kept = next.slice(0, 10).filter((r) => before.has(r.symbol)).length;
    if (kept < 7) {
      return { ok: false, reason: `only ${kept} of the previous top 10 remain — suspicious` };
    }
  }
  return { ok: true };
}
