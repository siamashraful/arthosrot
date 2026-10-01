import { z } from "zod";
import { SECTORS, TOP100_LIST, TOP100_SEED, type Sector, type SectorIcon } from "@/core/discovery";
import { displayFreshness, type DisplayFreshness, type Quote } from "@/core/market-data";
import { AppError, systemClock } from "@/core/shared";
import { marketCapRankings } from "@/infra/db/repositories/market-cap-rankings";
import { getContainer } from "../container";
import { serializeQuote } from "./market";

/**
 * Markets browse surfaces (/api/v1/browse): the sector catalog and the Top 100
 * by market value. Lists are paged 25 at a time so each page is one batched
 * quote call. Quotes ride the shared cache; a symbol the feed can't quote
 * comes back with quote:null (the row still links to its instrument page).
 */

export const BROWSE_PAGE = 25;

/** Curated names read better than SEC filing names ("NVIDIA" vs "Nvidia Corp."). */
const CURATED_NAMES = new Map(
  SECTORS.flatMap((s) => s.companies.map((c) => [c.symbol, c.name] as const)),
);

interface Top100 {
  asOf: string;
  entries: Array<{ rank: number; symbol: string; name: string; marketCap: string | null }>;
}

/** Newest job snapshot, or the generated seed until one exists. */
async function top100(): Promise<Top100> {
  // Display data must not take the Markets screen down: if the ranking store
  // is unreachable (e.g. the web deployed before its migration ran), log it
  // loudly and serve the dated seed instead.
  const latest = await marketCapRankings.latest(TOP100_LIST).catch((err: unknown) => {
    console.error(
      JSON.stringify({ level: "error", msg: "top-100 snapshot unavailable", err: String(err) }),
    );
    return null;
  });
  if (latest && latest.entries.length > 0) {
    return {
      asOf: latest.asOf.toISOString(),
      entries: latest.entries.map((e) => ({
        rank: e.rank,
        symbol: e.symbol,
        name: CURATED_NAMES.get(e.symbol) ?? e.name,
        marketCap: e.marketCap,
      })),
    };
  }
  return {
    // midday UTC: the seed is a date, and midnight UTC is still the day before in New York
    asOf: new Date(`${TOP100_SEED.asOf}T12:00:00Z`).toISOString(),
    entries: TOP100_SEED.entries.map((e) => ({ ...e, marketCap: null })),
  };
}

export async function getBrowse(): Promise<unknown> {
  const ranking = await top100();
  return {
    top100: {
      slug: TOP100_LIST,
      name: "Top 100",
      count: ranking.entries.length,
      asOf: ranking.asOf,
      preview: ranking.entries.slice(0, 5).map((e) => e.symbol),
    },
    sectors: SECTORS.map((s) => ({
      slug: s.slug,
      name: s.name,
      icon: s.icon,
      count: s.companies.length,
      preview: s.companies.slice(0, 3).map((c) => c.symbol),
    })),
  };
}

const pageSchema = z.coerce.number().int().min(0).max(40).default(0);

export async function getBrowseList(slug: string, request: Request): Promise<unknown> {
  const page = pageSchema.parse(new URL(request.url).searchParams.get("page") ?? undefined);

  let header: { slug: string; name: string; blurb: string; icon: SectorIcon | "trophy" };
  let rows: Array<{ rank?: number; symbol: string; name: string; marketCap?: string | null }>;
  let rankingAsOf: string | null = null;
  if (slug === TOP100_LIST) {
    const ranking = await top100();
    header = {
      slug,
      name: "Top 100",
      blurb: "The 100 largest US companies by market value — share count × share price.",
      icon: "trophy",
    };
    rows = ranking.entries;
    rankingAsOf = ranking.asOf;
  } else {
    const sector: Sector | undefined = SECTORS.find((s) => s.slug === slug);
    if (!sector) throw new AppError("NOT_FOUND", "No such list");
    header = { slug, name: sector.name, blurb: sector.blurb, icon: sector.icon };
    rows = [...sector.companies];
  }

  const slice = rows.slice(page * BROWSE_PAGE, (page + 1) * BROWSE_PAGE);
  const { marketData } = getContainer();
  const [quotes, market] = await Promise.all([
    slice.length ? marketData.getQuotes(slice.map((r) => r.symbol)) : new Map<string, Quote>(),
    marketData.getMarketStatus(),
  ]);
  const now = systemClock.now();
  // One chip for the list: the stalest quote on the page governs.
  const oldest = [...quotes.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime())[0];
  const freshness: DisplayFreshness | null = oldest
    ? displayFreshness(oldest, now, market.status)
    : null;

  return {
    list: { ...header, count: rows.length },
    rankingAsOf,
    page,
    nextPage: (page + 1) * BROWSE_PAGE < rows.length ? page + 1 : null,
    instruments: slice.map((r) => {
      const quote = quotes.get(r.symbol);
      return {
        ...(r.rank !== undefined ? { rank: r.rank } : {}),
        symbol: r.symbol,
        name: r.name,
        ...(r.marketCap !== undefined ? { marketCap: r.marketCap } : {}),
        quote: quote ? serializeQuote(quote) : null,
      };
    }),
    market: { status: market.status, asOf: market.asOf.toISOString() },
    freshness,
    freshnessTs: oldest?.ts.toISOString() ?? null,
    source: oldest?.source ?? null,
  };
}
