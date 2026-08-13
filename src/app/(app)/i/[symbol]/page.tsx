"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { CandleChart } from "@/components/finance/CandleChart";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { TradingTicket } from "@/components/finance/TradingTicket";
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

  if (isPending) return <div className="skeleton" style={{ height: 300 }} />;
  if (isError || !data) {
    return <div className="empty-state">Unknown symbol “{symbol}”.</div>;
  }

  const position = portfolio?.positions.find((p) => p.symbol === symbol);
  const watched = watchlist?.items.some((i) => i.symbol === symbol) ?? false;

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-3) var(--space-5)",
          alignItems: "baseline",
        }}
      >
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>
            {symbol}{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: "var(--text-base)" }}>
              {data.instrument.name} · {data.instrument.exchange}
            </span>
          </h1>
        </div>
        <div
          className="tabular"
          style={{ display: "flex", gap: "var(--space-4)", alignItems: "baseline" }}
        >
          <span style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
            {formatPrice(data.quote.last)}
          </span>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Bid {data.quote.bid ? formatPrice(data.quote.bid) : "—"}
            {data.quote.bidSize ? ` ×${data.quote.bidSize}` : ""}
          </span>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Ask {data.quote.ask ? formatPrice(data.quote.ask) : "—"}
            {data.quote.askSize ? ` ×${data.quote.askSize}` : ""}
          </span>
          <FreshnessChip
            ts={data.quote.ts}
            source={data.quote.source}
            marketStatus={data.market.status}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => addWatch.mutate()}
          disabled={watched || addWatch.isPending}
        >
          {watched ? "On watchlist" : "Add to watchlist"}
        </button>
      </header>

      {position ? (
        <section
          aria-label="Your position"
          className="card tabular"
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-5)" }}
        >
          <span className="field-label" style={{ alignSelf: "center" }}>
            Your position
          </span>
          <span>{position.qty} shares</span>
          <span className="muted">avg cost {formatPrice4(position.avgCost)}</span>
          <span className="muted">sellable {position.sellableQty}</span>
        </section>
      ) : null}

      <div className="instrument-grid">
        <CandleChart symbol={symbol} />
        <TradingTicket
          symbol={symbol}
          quote={data.quote}
          buyingPower={portfolio?.summary.buyingPower ?? "0.00"}
          sellable={position?.sellableQty ?? "0"}
        />
      </div>
    </div>
  );
}
