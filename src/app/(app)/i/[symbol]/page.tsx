"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Star } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { CandleChart } from "@/components/finance/CandleChart";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { TicketPanel } from "@/components/finance/TicketPanel";
import { api } from "@/lib/api";
import { formatPrice, formatPrice4 } from "@/lib/format";

export default function InstrumentPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = decodeURIComponent(raw).toUpperCase();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ["instrument", symbol],
    queryFn: () => api.instrument(symbol),
    refetchInterval: 15_000,
  });
  const { data: portfolio } = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio });
  const { data: watchlist } = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });

  const addWatch = useMutation({
    mutationFn: () => api.addToWatchlist(symbol),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (isPending) {
    return (
      <div aria-busy="true" role="status" aria-label="Loading instrument">
        <div className="ar-skel" style={{ height: 300, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__title">Unknown symbol “{symbol}”</span>
          <Link href="/markets" className="ar-btn ar-btn--primary">
            Search markets
          </Link>
        </div>
      </div>
    );
  }

  const position = portfolio?.positions.find((p) => p.symbol === symbol);
  const watched = watchlist?.items.some((i) => i.symbol === symbol) ?? false;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <Link
          href="/markets"
          className="ar-btn ar-btn--icon ar-btn--plain"
          aria-label="Back to markets"
        >
          <ChevronLeft aria-hidden />
        </Link>
        <span className="ar-appbar__title ar-appbar__title--sm">{data.instrument.name}</span>
        <button
          type="button"
          className="ar-btn ar-btn--secondary ar-btn--compact"
          onClick={() => addWatch.mutate()}
          disabled={watched || addWatch.isPending}
        >
          <Star size={16} aria-hidden />
          {watched ? "On watchlist" : "Add to watchlist"}
        </button>
      </div>

      <header style={{ display: "grid", gap: 8 }}>
        {/* the heading is the ticker alone; the company/venue tag sits beside
            it so assistive tech reads a clean page title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <SymbolLogo symbol={symbol} size={40} />
          <h1 className="ar-title">{symbol}</h1>
          <span className="ar-tag ar-tag--sky">
            {data.instrument.name} · {data.instrument.exchange}
          </span>
        </div>
        {data.quote ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="ar-title tabular">{formatPrice(data.quote.last)}</span>
            <FreshnessChip
              ts={data.quote.ts}
              source={data.quote.source}
              marketStatus={data.market.status}
            />
          </div>
        ) : (
          <span className="ar-caption ar-secondary">
            No live quote — this symbol may be delisted. Existing holdings can still be sold with a
            limit order.
          </span>
        )}
        {data.quote ? (
          <div className="ar-caption ar-tertiary tabular" style={{ display: "flex", gap: 16 }}>
            <span>
              Bid {data.quote.bid ? formatPrice(data.quote.bid) : "—"}
              {data.quote.bidSize ? ` ×${data.quote.bidSize}` : ""}
            </span>
            <span>
              Ask {data.quote.ask ? formatPrice(data.quote.ask) : "—"}
              {data.quote.askSize ? ` ×${data.quote.askSize}` : ""}
            </span>
          </div>
        ) : null}
      </header>

      {position ? (
        <section
          aria-label="Your position"
          className="ar-card"
          style={{ paddingTop: 4, paddingBottom: 4 }}
        >
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Your position</span>
            <span className="ar-ticket-row__value">{position.qty} shares</span>
          </div>
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Average cost</span>
            <span className="ar-ticket-row__value">{formatPrice4(position.avgCost)}</span>
          </div>
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Sellable</span>
            <span className="ar-ticket-row__value">{position.sellableQty}</span>
          </div>
        </section>
      ) : null}

      <div className="instrument-grid">
        <div className="ar-card">
          <CandleChart symbol={symbol} />
        </div>
        <TicketPanel
          symbol={symbol}
          quote={data.quote}
          buyingPower={portfolio?.summary.buyingPower ?? "0.00"}
          sellable={position?.sellableQty ?? "0"}
        />
      </div>
    </div>
  );
}
