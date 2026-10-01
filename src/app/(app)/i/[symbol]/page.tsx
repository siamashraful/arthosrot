"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Star } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { CandleChart } from "@/components/finance/CandleChart";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { KeyStats } from "@/components/finance/KeyStats";
import { PriceChange } from "@/components/finance/PriceChange";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { TicketPanel } from "@/components/finance/TicketPanel";
import { useTradingMode } from "@/components/trading-mode";
import { api, ApiError } from "@/lib/api";
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
  // Paper holdings and buying power never render in live preview (ADR-011):
  // there the ticket shows its own refusal and no position strip appears.
  const mode = useTradingMode();
  const { data: portfolio, isError: portfolioError } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    enabled: mode === "paper",
  });
  const { data: watchlist } = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });

  // Watchlist toggle: add when absent, remove (by item id) when present. The
  // server returns the fresh list either way, so the cache is set directly.
  const toggleWatch = useMutation({
    mutationFn: (itemId: string | null) =>
      itemId ? api.removeFromWatchlist(itemId) : api.addToWatchlist(symbol),
    onSuccess: (fresh) => queryClient.setQueryData(["watchlist"], fresh),
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

  const position =
    mode === "paper" ? portfolio?.positions.find((p) => p.symbol === symbol) : undefined;
  const watchItem = watchlist?.items.find((i) => i.symbol === symbol) ?? null;

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
          onClick={() => toggleWatch.mutate(watchItem?.id ?? null)}
          disabled={!watchlist || toggleWatch.isPending}
          aria-pressed={watchItem !== null}
        >
          <Star size={16} aria-hidden fill={watchItem ? "currentColor" : "none"} />
          {watchItem ? "Remove from watchlist" : "Add to watchlist"}
        </button>
      </div>
      {toggleWatch.isError ? (
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          {toggleWatch.error instanceof ApiError
            ? toggleWatch.error.message
            : "Watchlist could not be updated — try again."}
        </p>
      ) : null}

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
            {data.quote.dayChange ? (
              <span className="ar-label">
                <PriceChange
                  amount={data.quote.dayChange.absolute}
                  percent={Number(data.quote.dayChange.percent)}
                />
                <span className="sr-only">
                  {data.market.status === "CLOSED" ? " last session" : " today"}
                </span>
              </span>
            ) : null}
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
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="ar-card">
            <CandleChart symbol={symbol} />
          </div>
          <KeyStats symbol={symbol} />
        </div>
        {mode === "live" ? (
          // renders the live-preview refusal; no paper figures are passed
          <TicketPanel symbol={symbol} quote={data.quote} buyingPower="0.00" sellable="0" />
        ) : portfolio ? (
          <TicketPanel
            symbol={symbol}
            quote={data.quote}
            buyingPower={portfolio.summary.buyingPower}
            sellable={position?.sellableQty ?? "0"}
          />
        ) : portfolioError ? (
          // No active account (not opened yet, or still being funded): the
          // ticket would only fail at submit — say so and point the way.
          <div className="ar-card">
            <div className="ar-empty">
              <span className="ar-empty__title">Open your account to trade</span>
              <span className="ar-empty__text">
                Your practice account needs to be open and funded before you can place orders.
              </span>
              <Link href="/" className="ar-btn ar-btn--primary">
                Go to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div
            className="ar-skel"
            aria-busy="true"
            aria-label="Loading trade ticket"
            style={{ height: 320, borderRadius: "var(--radius-card)" }}
          />
        )}
      </div>
    </div>
  );
}
