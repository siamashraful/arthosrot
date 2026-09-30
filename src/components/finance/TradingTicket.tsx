"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { api, ApiError, type QuoteDto } from "@/lib/api";
import { formatMoney, formatPrice } from "@/lib/format";
import { Explainer } from "../Explainer";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { FillProgress } from "./FillProgress";

/**
 * The trading ticket (docs/design/UX_PATTERNS.md): labeled Buy/Sell segmented
 * control (brand-neutral — never green/red), explicit review step showing the
 * order rows the system requires before submission, a single primary
 * confirm, and a live order chip after submission — never optimistic FILLED.
 * Estimates use ask for buys / bid for sells. Estimation only — display math
 * on numbers; all real arithmetic is server-side decimal.
 */

const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "SUBMIT_FAILED"]);

export function TradingTicket({
  symbol,
  quote,
  buyingPower,
  sellable,
}: {
  symbol: string;
  /** null when the feed no longer quotes this instrument — LIMIT-only then. */
  quote: QuoteDto | null;
  buyingPower: string;
  sellable: string;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  // No quote -> no market-order reference price: LIMIT is the only honest type.
  const [type, setType] = useState<"MARKET" | "LIMIT">(quote ? "MARKET" : "LIMIT");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qtyNum = Number.parseInt(qty, 10);
  const validQty = Number.isInteger(qtyNum) && qtyNum > 0;
  const validLimit = type === "MARKET" || /^\d+(\.\d{1,4})?$/.test(limitPrice);

  const estimate = useMemo(() => {
    if (!validQty) return null;
    const ref =
      type === "LIMIT" && validLimit && limitPrice
        ? Number(limitPrice)
        : quote
          ? Number((side === "BUY" ? (quote.ask ?? quote.last) : (quote.bid ?? quote.last)) ?? 0)
          : null;
    return ref === null ? null : (ref * qtyNum).toFixed(2);
  }, [validQty, qtyNum, type, validLimit, limitPrice, side, quote]);

  // Pre-checks for orders that are certain to be rejected, so the user learns
  // before review rather than after submit. Advisory display comparisons on
  // the client's own estimate — the server re-derives every reservation in
  // decimal under the placement lock and stays the authority (market buys
  // also reserve a price buffer, which only the server applies).
  const sellableNum = Number.parseInt(sellable, 10) || 0;
  const precheck: string | null = !validQty
    ? null
    : side === "SELL"
      ? sellableNum === 0
        ? `You don't hold any ${symbol} to sell.`
        : qtyNum > sellableNum
          ? `You can sell up to ${sellableNum} ${sellableNum === 1 ? "share" : "shares"}.`
          : null
      : estimate !== null && Number(estimate) > Number(buyingPower)
        ? `Estimated cost is more than your buying power (${formatMoney(buyingPower)}).`
        : null;

  const place = useMutation({
    mutationFn: () =>
      api.placeOrder({
        symbol,
        side,
        type,
        qty: qtyNum,
        ...(type === "LIMIT" ? { limitPrice } : {}),
        idempotencyKey,
      }),
    onSuccess: ({ order }) => {
      setPlacedOrderId(order.id);
      setReviewing(false);
      setQty("");
      setLimitPrice("");
      setIdempotencyKey(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err) => {
      setReviewing(false);
      setError(err instanceof ApiError ? err.message : "Order could not be placed.");
    },
  });

  // The user edits the ticket -> it becomes a NEW order intent (fresh key).
  function onEdit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setError(null);
      setReviewing(false);
      setIdempotencyKey(crypto.randomUUID());
    };
  }

  const sideWord = side === "BUY" ? "Buy" : "Sell";
  const typeWord = type === "MARKET" ? "Market" : `Limit ${formatPrice(limitPrice)}`;
  const refPrice = quote
    ? formatPrice((side === "BUY" ? quote.ask : quote.bid) ?? quote.last)
    : "—";

  return (
    <section className="ar-card" aria-label={`Trade ${symbol}`}>
      <h2 className="ar-heading" style={{ marginBottom: 16 }}>
        Trade {symbol}
      </h2>

      <div style={{ display: "grid", gap: 16 }}>
        <div className="ar-seg ar-seg--block" role="group" aria-label="Order side">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`ar-seg__item${side === s ? " is-selected" : ""}`}
              aria-pressed={side === s}
              onClick={() => onEdit(setSide)(s)}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="ar-field">
          <label className="ar-field__label" htmlFor={`${uid}-type`}>
            Order type
          </label>
          <select
            id={`${uid}-type`}
            className="select"
            value={type}
            onChange={(e) => onEdit(setType)(e.target.value as "MARKET" | "LIMIT")}
          >
            <option value="MARKET" disabled={!quote}>
              Market
            </option>
            <option value="LIMIT">Limit (day)</option>
          </select>
        </div>

        <div className="ar-field">
          <label className="ar-field__label" htmlFor={`${uid}-qty`}>
            Quantity (whole shares)
          </label>
          <div className="ar-input">
            <input
              id={`${uid}-qty`}
              className="tabular"
              inputMode="numeric"
              pattern="[0-9]*"
              value={qty}
              onChange={(e) => onEdit(setQty)(e.target.value.replace(/[^0-9]/g, ""))}
              aria-describedby={`${uid}-available`}
            />
          </div>
          <span id={`${uid}-available`} className="ar-field__help tabular">
            {side === "BUY"
              ? `Buying power ${formatMoney(buyingPower)}`
              : `Sellable ${sellable} shares`}
          </span>
          {side === "BUY" ? <Explainer topic="buying-power" /> : null}
        </div>

        {type === "LIMIT" ? (
          <div className="ar-field">
            <label className="ar-field__label" htmlFor={`${uid}-limit`}>
              Limit price
            </label>
            <div className="ar-input">
              <input
                id={`${uid}-limit`}
                className="tabular"
                inputMode="decimal"
                value={limitPrice}
                onChange={(e) => onEdit(setLimitPrice)(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
            {quote ? (
              <span className="ar-field__help tabular">Last {formatPrice(quote.last)}</span>
            ) : null}
          </div>
        ) : null}

        {!reviewing ? (
          <div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{side === "BUY" ? "Ask" : "Bid"}</span>
              <span className="ar-ticket-row__value">{refPrice}</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">
                Estimated {side === "BUY" ? "cost" : "proceeds"}
              </span>
              <span className="ar-ticket-row__value">{estimate ? formatMoney(estimate) : "—"}</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Estimated fees</span>
              <span className="ar-ticket-row__value">$0.00</span>
            </div>
          </div>
        ) : null}

        {precheck && !error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {precheck}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        {!reviewing ? (
          <button
            type="button"
            className="ar-btn ar-btn--primary ar-btn--block"
            disabled={!validQty || !validLimit || precheck !== null || place.isPending}
            onClick={() => setReviewing(true)}
          >
            Review order
          </button>
        ) : (
          <div className="review-summary">
            <p className="ar-body-strong" style={{ margin: "0 0 4px" }}>
              {sideWord} {qtyNum} {symbol} · {typeWord} · est.{" "}
              {estimate ? formatMoney(estimate) : "—"}
            </p>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Order type</span>
              <span className="ar-ticket-row__value">{typeWord} · day</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Quantity</span>
              <span className="ar-ticket-row__value">
                {qtyNum} {qtyNum === 1 ? "share" : "shares"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{side === "BUY" ? "Ask" : "Bid"}</span>
              <span className="ar-ticket-row__value">{refPrice}</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">
                Estimated {side === "BUY" ? "cost" : "proceeds"}
              </span>
              <span className="ar-ticket-row__value">{estimate ? formatMoney(estimate) : "—"}</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Estimated fees</span>
              <span className="ar-ticket-row__value">$0.00</span>
            </div>
            <p className="ar-caption ar-secondary" style={{ margin: "12px 0 0" }}>
              Paper account — simulated money. Execution price may differ from the displayed quote.
            </p>
            <div className="ar-btn-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="ar-btn ar-btn--secondary"
                onClick={() => setReviewing(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="ar-btn ar-btn--primary"
                disabled={place.isPending}
                onClick={() => place.mutate()}
              >
                {place.isPending ? "Placing…" : "Confirm order"}
              </button>
            </div>
          </div>
        )}

        {placedOrderId ? <PlacedOrderChip orderId={placedOrderId} /> : null}
      </div>
    </section>
  );
}

/** Live order chip: advances via polling until terminal — no manual refresh. */
function PlacedOrderChip({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.orderDetail(orderId),
    refetchInterval: (query) => {
      const state = query.state.data?.order.state;
      if (state && TERMINAL.has(state)) {
        // A terminal order may have moved cash and shares: refresh every
        // view derived from them, including the net-worth series.
        void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        void queryClient.invalidateQueries({ queryKey: ["portfolio-history"] });
        void queryClient.invalidateQueries({ queryKey: ["ledger"] });
        void queryClient.invalidateQueries({ queryKey: ["orders"] });
        return false;
      }
      return 1_500;
    },
  });
  if (!data) return <div className="ar-skel ar-skel--text" style={{ height: 24 }} />;
  const { order } = data;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        aria-live="polite"
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        <OrderStatusBadge state={order.state} display={order.stateDisplay} />
        <FillProgress filledQty={order.filledQty} qty={order.qty} />
        <span className="ar-label tabular">
          {order.side === "BUY" ? "Buy" : "Sell"} {order.filledQty}/{order.qty} {order.symbol}
        </span>
        {order.rejectReason ? (
          <span className="ar-caption ar-secondary">{order.rejectReason}</span>
        ) : null}
      </div>
      {order.state === "PARTIALLY_FILLED" ? <Explainer topic="partial-fill" /> : null}
    </div>
  );
}
