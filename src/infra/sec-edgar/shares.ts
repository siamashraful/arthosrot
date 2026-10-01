import { ProviderUnavailableError } from "@/core/market-data";
import { Money, Qty } from "@/core/money";
import type { ShareCount, SharesOutstandingSource } from "@/core/discovery";

/**
 * SEC EDGAR share counts (docs/architecture/INTEGRATIONS.md). Free, keyless,
 * official — but SEC fair access requires a descriptive User-Agent with a
 * contact (anonymous agents get 403) and ≤ 10 requests/second.
 *
 * Bulk "frames" give one fact per filer per calendar period in ONE request:
 * - dei:EntityCommonStockSharesOutstanding (instant) — the 10-Q/10-K cover
 *   page count; current, but multi-class filers tag it per class with
 *   dimensions, so the frame omits them (Alphabet, Meta).
 * - us-gaap:WeightedAverageNumberOfSharesOutstandingBasic (quarter) — total
 *   across classes; a quarter behind but covers multi-class filers.
 * A single-class filer uses its cover count; multi-class or missing cover
 * falls back to the weighted average. Filers the bulk data gets wrong live in
 * core/discovery SHARE_OVERRIDES. Vendor shapes never leave this file.
 */

const SEC_DATA = "https://data.sec.gov";
const SEC_WWW = "https://www.sec.gov";
const MIN_GAP_MS = 120; // ≤ ~8 req/s, inside the 10/s fair-access ceiling
const MAX_AGE_MS = 400 * 86_400_000; // older counts are a stale filer, not data

export type SecFetch = (url: string, init: RequestInit) => Promise<Response>;

interface FrameRow {
  cik: number;
  entityName: string;
  end: string;
  val: number;
}

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

/** Class tickers only ("BRK-B"); preferreds/units ("BAC-PL", "XYZ-WT") excluded. */
const COMMON_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

/** Calendar quarter ids for frames: [current, previous, …] as "CY2026Q3". */
export function recentQuarters(now: Date, count: number): string[] {
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`CY${y}Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

/**
 * Which count to trust for a filer:
 * - single class: the cover count (current, point-in-time) when there is one;
 * - multi-class: the weighted average — the cover frame holds one class only,
 *   so a legitimate total can be a few times larger — unless it's implausibly
 *   far off (> 50× or < ½ the cover count: a mis-scaled filing, seen once at
 *   1,000×), then the cover count;
 * - otherwise whichever exists.
 */
function chooseCount(
  c: FrameRow | undefined,
  w: FrameRow | undefined,
  multiClass: boolean,
): { row: FrameRow; basis: "cover" | "weighted-average" } | null {
  if (c && (!multiClass || !w)) return { row: c, basis: "cover" };
  if (c && w) {
    const ratio = w.val / c.val;
    return ratio > 50 || ratio < 0.5
      ? { row: c, basis: "cover" }
      : { row: w, basis: "weighted-average" };
  }
  return w ? { row: w, basis: "weighted-average" } : null;
}

export class SecEdgarShares implements SharesOutstandingSource {
  private lastRequestAt = 0;
  private sicCache = new Map<string, string | null>();

  constructor(
    private readonly userAgent: string,
    private readonly fetchFn: SecFetch = (url, init) => fetch(url, init),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async get<T>(url: string, { allow404 = false } = {}): Promise<T | null> {
    const wait = this.lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new ProviderUnavailableError("SEC request failed", err);
    }
    // A frame for a quarter nobody has filed yet doesn't exist — that's data.
    if (res.status === 404 && allow404) return null;
    if (!res.ok) throw new ProviderUnavailableError(`SEC request failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Latest value per CIK across the given frames (newest period end wins). */
  private async frames(
    concept: string,
    unit: "shares" | "USD",
    periods: string[],
    now: Date,
    maxAgeMs = MAX_AGE_MS,
  ): Promise<Map<number, FrameRow>> {
    const latest = new Map<number, FrameRow>();
    for (const period of periods) {
      const body = await this.get<{ data: FrameRow[] }>(
        `${SEC_DATA}/api/xbrl/frames/${concept}/${unit}/${period}.json`,
        { allow404: true },
      );
      for (const row of body?.data ?? []) {
        if (!(row.val > 0)) continue;
        if (now.getTime() - Date.parse(row.end) > maxAgeMs) continue;
        const prev = latest.get(row.cik);
        if (!prev || row.end > prev.end) latest.set(row.cik, row);
      }
    }
    return latest;
  }

  async listShareCounts(now: Date): Promise<ShareCount[]> {
    const tickersBody = await this.get<Record<string, TickerRow>>(
      `${SEC_WWW}/files/company_tickers.json`,
    );
    // CIK → common tickers in file order (SEC lists the primary class first)
    const tickers = new Map<number, { title: string; symbols: string[] }>();
    for (const row of Object.values(tickersBody ?? {})) {
      if (!COMMON_TICKER.test(row.ticker)) continue;
      const entry = tickers.get(row.cik_str) ?? { title: row.title, symbols: [] };
      const symbol = row.ticker.replace("-", "."); // SEC "BRK-B" → our "BRK.B"
      if (!entry.symbols.includes(symbol)) entry.symbols.push(symbol);
      tickers.set(row.cik_str, entry);
    }

    // Frames are keyed by calendar quarter but filled by "closest fit", and a
    // quarter's frame only exists once filings land — so read a window and
    // keep each filer's newest value (also immune to UTC quarter boundaries).
    const quarters = recentQuarters(now, 8);
    const cover = await this.frames(
      "dei/EntityCommonStockSharesOutstanding",
      "shares",
      quarters.slice(0, 3).map((q) => `${q}I`),
      now,
    );
    const weighted = await this.frames(
      "us-gaap/WeightedAverageNumberOfSharesOutstandingBasic",
      "shares",
      quarters.slice(1, 4), // duration frames: completed quarters only
      now,
    );
    // Public float is measured once a year (the 10-K cover, as of the
    // filer's Q2 end), so its window is wider.
    const floats = await this.frames(
      "dei/EntityPublicFloat",
      "USD",
      quarters.map((q) => `${q}I`),
      now,
      700 * 86_400_000,
    );

    const out: ShareCount[] = [];
    for (const [cik, { title, symbols }] of tickers) {
      const multiClass = symbols.length > 1;
      const pick = chooseCount(cover.get(cik), weighted.get(cik), multiClass);
      const float = floats.get(cik);
      if (!pick && !float) continue;
      out.push({
        cik: String(cik),
        name: title,
        tickers: symbols,
        shares: pick ? Qty.of(BigInt(Math.round(pick.row.val))) : null,
        asOf: pick?.row.end ?? float!.end,
        basis: pick?.basis ?? "none",
        publicFloat: float ? Money.fromString(BigInt(Math.round(float.val)).toString()) : null,
      });
    }
    return out;
  }

  async industryCode(cik: string): Promise<string | null> {
    if (this.sicCache.has(cik)) return this.sicCache.get(cik)!;
    const body = await this.get<{ sic?: string }>(
      `${SEC_DATA}/submissions/CIK${cik.padStart(10, "0")}.json`,
      { allow404: true },
    );
    const sic = body?.sic || null;
    this.sicCache.set(cik, sic);
    return sic;
  }
}
