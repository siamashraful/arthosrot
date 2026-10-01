"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { BackAppBar } from "@/components/BackAppBar";
import { AlertSheet } from "@/components/finance/AlertSheet";
import { CandleChart } from "@/components/finance/CandleChart";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { KeyStats } from "@/components/finance/KeyStats";
import { PriceChange } from "@/components/finance/PriceChange";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { TicketPanel } from "@/components/finance/TicketPanel";
import { isNoActiveAccount } from "@/components/finance/order-queries";
import { Icon } from "@/components/icons/Icon";
import { EmptyCard, ErrorCard, showError } from "@/components/states";
import { useTradingMode } from "@/components/trading-mode";
import { api, ApiError } from "@/lib/api";
import { formatPrice, formatPrice4, formatShares } from "@/lib/format";
import { queries } from "@/lib/queries";

/** A symbol the server will never know: unknown (404) or malformed (VALIDATION, 422). */
function isUnknownSymbol(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.body.code === "VALIDATION");
}

/** `/i/%` and friends: a malformed escape is an unknown symbol, not a crash. */
function decodeSymbol(raw: string): string | null {
  try {
    return decodeURIComponent(raw).toUpperCase();
  } catch {
    return null;
  }
}

export default function InstrumentPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = decodeSymbol(raw);
  if (symbol === null) return <UnknownSymbol symbol={raw} />;
  return <Instrument symbol={symbol} />;
}

function UnknownSymbol({ symbol }: { symbol: string }) {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <BackAppBar href="/markets" backLabel="Back to search" title="" titleAs="span" size="sm" />
      <EmptyCard
        title={`Unknown symbol “${symbol}”`}
        message="We couldn't find a stock with that ticker."
        action={
          <Link href="/markets" className="ar-btn ar-btn--primary">
            Search markets
          </Link>
        }
      />
    </div>
  );
}

function Instrument({ symbol }: { symbol: string }) {
  const queryClient = useQueryClient();
  const instrument = useQuery({
    queryKey: ["instrument", symbol],
    queryFn: () => api.instrument(symbol),
    // an unknown symbol stays unknown — no retries, no polling
    retry: (count, err) => !isUnknownSymbol(err) && count < 3,
    refetchInterval: (q) => (isUnknownSymbol(q.state.error) ? false : 15_000),
  });
  // Paper holdings and buying power never render in live preview (ADR-011):
  // there the ticket shows its own refusal and no position strip appears.
  const mode = useTradingMode();
  const paper = mode === "paper";
  const portfolio = useQuery({ ...queries.portfolio(), enabled: paper });
  const watchlist = useQuery({ ...queries.watchlist(), enabled: paper });

  // Watchlist toggle: add when absent, remove (by item id) when present. The
  // server returns the fresh list either way, so the cache is set directly.
  const toggleWatch = useMutation({
    mutationFn: (itemId: string | null) =>
      itemId ? api.removeFromWatchlist(itemId) : api.addToWatchlist(symbol),
    onSuccess: (fresh) => queryClient.setQueryData(queries.watchlist().queryKey, fresh),
  });

  if (instrument.isPending) {
    return (
      <div aria-busy="true" role="status" aria-label="Loading instrument">
        <div className="ar-skel" style={{ height: 300, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }
  if (showError(instrument) || !instrument.data) {
    if (isUnknownSymbol(instrument.error)) return <UnknownSymbol symbol={symbol} />;
    return (
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <BackAppBar href="/markets" backLabel="Back to search" title={symbol} size="sm" />
        <ErrorCard
          message={`${symbol} couldn't be loaded right now.`}
          onRetry={() => void instrument.refetch()}
          retrying={instrument.isFetching}
        />
      </div>
    );
  }

  const data = instrument.data;
  const position = paper ? portfolio.data?.positions.find((p) => p.symbol === symbol) : undefined;
  const watchItem = watchlist.data?.items.find((i) => i.symbol === symbol) ?? null;
  const watchError = toggleWatch.isError
    ? toggleWatch.error instanceof ApiError
      ? toggleWatch.error.message
      : "Watchlist could not be updated. Try again."
    : showError(watchlist)
      ? "Your watchlist couldn't be loaded, so it can't be changed right now."
      : null;

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <BackAppBar
        href="/markets"
        backLabel="Back to search"
        title={data.instrument.name}
        titleAs="span"
        size="sm"
        trailing={
          paper ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <AlertSheet
                symbol={symbol}
                quote={data.quote}
                marketStatus={data.market.status}
                freshness={data.freshness}
              />
              <button
                type="button"
                className="ar-btn ar-btn--secondary ar-btn--compact"
                onClick={() => toggleWatch.mutate(watchItem?.id ?? null)}
                disabled={!watchlist.data || toggleWatch.isPending}
                aria-pressed={watchItem !== null}
              >
                <Icon name="star" size={16} filled={watchItem !== null} />
                {watchItem ? "Remove from watchlist" : "Add to watchlist"}
              </button>
            </div>
          ) : null
        }
      />
      {watchError ? (
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          {watchError}
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
                  percent={data.quote.dayChange.percent}
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
              freshness={data.freshness}
            />
          </div>
        ) : (
          <span className="ar-caption ar-secondary">
            No live quote: this symbol may be delisted. Shares you hold can still be sold with a
            limit order.
          </span>
        )}
        {data.quote ? (
          <div className="ar-caption ar-tertiary tabular" style={{ display: "flex", gap: 16 }}>
            <span>
              Bid {data.quote.bid ? formatPrice(data.quote.bid) : "N/A"}
              {data.quote.bidSize ? ` ×${data.quote.bidSize}` : ""}
            </span>
            <span>
              Ask {data.quote.ask ? formatPrice(data.quote.ask) : "N/A"}
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
            <span className="ar-ticket-row__value">{formatShares(position.qty)}</span>
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
        {!paper ? (
          // renders the live-preview refusal; no paper figures are passed
          <TicketPanel
            symbol={symbol}
            quote={data.quote}
            buyingPower="0.00"
            sellable="0"
            buyable={false}
          />
        ) : portfolio.data ? (
          <TicketPanel
            symbol={symbol}
            quote={data.quote}
            buyingPower={portfolio.data.summary.buyingPower}
            sellable={position?.sellableQty ?? "0"}
            buyable={data.instrument.status === "ACTIVE"}
            marketBuyBuffer={data.trading.marketBuyBuffer}
          />
        ) : showError(portfolio) && isNoActiveAccount(portfolio.error) ? (
          // No active account (not opened yet, or still being funded): the
          // ticket would only fail at submit — say so and point the way.
          <EmptyCard
            title="Open your account to trade"
            message="Your practice account needs to be open and funded before you can place orders."
            action={
              <Link href="/" className="ar-btn ar-btn--primary">
                Go to dashboard
              </Link>
            }
          />
        ) : showError(portfolio) ? (
          <ErrorCard
            message="The trade ticket couldn't load your buying power."
            onRetry={() => void portfolio.refetch()}
            retrying={portfolio.isFetching}
          />
        ) : (
          <div
            className="ar-skel"
            role="status"
            aria-busy="true"
            aria-label="Loading trade ticket"
            style={{ height: 320, borderRadius: "var(--radius-card)" }}
          />
        )}
      </div>
    </div>
  );
}
