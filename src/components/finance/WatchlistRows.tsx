"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icons/Icon";
import { api, type QuoteDto, type WatchlistItem } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { FreshnessChip } from "./FreshnessChip";
import { PriceChange } from "./PriceChange";
import { Sparkline } from "./Sparkline";
import { SymbolRow } from "./SymbolRow";

/**
 * Quotes + sparklines for the watchlist's symbols (/api/v1/watchlist/quotes),
 * every 30s while the market is open. The symbol set is in the key, so an
 * add or remove elsewhere refetches; keepPreviousData holds the old rows'
 * sparklines meanwhile. The rows and the header chip share this one query.
 */
function useWatchlistQuotes(items: readonly WatchlistItem[]) {
  return useQuery({
    queryKey: ["watchlist-quotes", items.map((i) => i.symbol).join(",")],
    queryFn: api.watchlistQuotes,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.market.status === "OPEN" ? 30_000 : false),
  });
}

/**
 * The watchlist's one freshness chip (the stalest quote), for the section
 * header. Until the quotes endpoint answers it ages the stalest quote the
 * watchlist itself carries, so a price is never on screen without context.
 */
export function WatchlistFreshnessChip({ items }: { items: readonly WatchlistItem[] }) {
  const { data } = useWatchlistQuotes(items);
  if (data?.freshnessTs && data.source) {
    return (
      <FreshnessChip
        ts={data.freshnessTs}
        source={data.source}
        marketStatus={data.market.status}
        freshness={data.freshness}
      />
    );
  }
  const stalest = items
    .map((i) => i.quote)
    .filter((q): q is QuoteDto => q !== null)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))[0];
  return stalest ? <FreshnessChip ts={stalest.ts} source={stalest.source} marketStatus="" /> : null;
}

/**
 * The dashboard watchlist as holding-form SymbolRows: logo · symbol + name ·
 * the session's sparkline (the row's aside) · price + day change (sr "today"
 * / "last session") · the remove button beside the link. Rows come from the
 * page's ["watchlist"] query; each prefers the quotes endpoint's quote and
 * falls back to the watchlist's own; no quote at all reads "N/A" (sr: "No
 * quote"). The page keeps owning the remove mutation: `onRemove(id, symbol)`
 * and `pendingId`. Pair with WatchlistFreshnessChip in the section header.
 */
export function WatchlistRows({
  items,
  onRemove,
  pendingId,
}: {
  items: readonly WatchlistItem[];
  onRemove: (itemId: string, symbol: string) => void;
  /** The item whose removal is in flight (its button shows busy). */
  pendingId: string | null;
}) {
  const { data } = useWatchlistQuotes(items);
  const bySymbol = new Map(data?.items.map((i) => [i.symbol, i]) ?? []);
  const period = data?.period === "last-session" ? " last session" : " today";

  return (
    <ul className="ar-card ar-card--list ar-list">
      {items.map((item) => {
        const live = bySymbol.get(item.symbol);
        const quote = live?.quote ?? item.quote ?? null;
        const removing = pendingId === item.id;
        return (
          <li key={item.id}>
            <SymbolRow
              symbol={item.symbol}
              title={item.symbol}
              sub={item.name !== item.symbol ? item.name : undefined}
              aside={
                <span className="ar-row__spark" aria-hidden>
                  <Sparkline values={live?.sparkline} />
                </span>
              }
              end={
                quote ? (
                  <>
                    <span className="ar-row__value">{formatPrice(quote.last)}</span>
                    {quote.dayChange ? (
                      <span>
                        <PriceChange
                          amount={quote.dayChange.absolute}
                          percent={quote.dayChange.percent}
                        />
                        <span className="sr-only">{period}</span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="ar-row__value ar-tertiary">
                    <span aria-hidden>N/A</span>
                    <span className="sr-only">No quote</span>
                  </span>
                )
              }
            />
            <button
              type="button"
              className="ar-btn ar-btn--icon ar-btn--plain"
              aria-label={`Remove ${item.symbol} from watchlist`}
              aria-busy={removing}
              disabled={removing}
              onClick={() => onRemove(item.id, item.symbol)}
            >
              <Icon name="x" size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
