"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import { api, type OrderDto, type QuoteDto } from "@/lib/api";
import { formatMoney, formatOrderType, formatPrice, formatShares } from "@/lib/format";
import {
  checkLimitPrice,
  checkQty,
  estimateNotional,
  reserveWithBuffer,
  placeOrderError,
  referencePrice,
  sanitizePriceInput,
  sanitizeQtyInput,
  ticketPrecheck,
} from "@/lib/order-ticket";
import { Explainer } from "../Explainer";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { FillProgress } from "./FillProgress";
import { isOrderTerminal } from "./order-state";
import {
  invalidateOrderViews,
  orderProgressSignature,
  useRefreshOnOrderProgress,
} from "./order-queries";

/**
 * The trading ticket (docs/design/UX_PATTERNS.md): labeled Buy/Sell segmented
 * control (brand-neutral — never green/red), explicit review step showing the
 * order rows the system requires before submission, a single primary
 * confirm, and a live order chip after submission — never optimistic FILLED.
 * Estimates use ask for buys / bid for sells, computed exactly in cents
 * (lib/order-ticket.ts); the server re-derives every reservation in decimal
 * under the placement lock and stays the authority.
 *
 * One idempotency key per order intent: a double-click, or confirming again
 * after a network/server failure, replays the same key and can never place
 * the order twice. Editing the ticket makes a new intent with a new key.
 */

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

export function TradingTicket({
  symbol,
  quote,
  buyingPower,
  sellable,
  buyable = true,
  marketBuyBuffer,
}: {
  symbol: string;
  /** null when the feed no longer quotes this instrument — LIMIT-only then. */
  quote: QuoteDto | null;
  buyingPower: string;
  sellable: string;
  /** false for a delisted instrument: holders can still sell, nobody can buy. */
  buyable?: boolean;
  /** Server placement rule: market buys reserve price × qty × (1 + buffer). */
  marketBuyBuffer?: string;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [side, setSide] = useState<Side>(buyable ? "BUY" : "SELL");
  const [chosenType, setType] = useState<OrderType>(quote ? "MARKET" : "LIMIT");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [placed, setPlaced] = useState<OrderDto | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  // No quote -> no market-order reference price: LIMIT is the only honest
  // type, even if the quote disappeared after the user picked Market.
  const type: OrderType = quote ? chosenType : "LIMIT";
  const qtyCheck = checkQty(qty);
  const limitCheck = type === "LIMIT" ? checkLimitPrice(limitPrice) : null;
  const refPrice = referencePrice(quote, side);
  const estimatePrice = type === "LIMIT" ? (limitCheck?.ok ? limitCheck.value : null) : refPrice;
  const estimate =
    qtyCheck.ok && estimatePrice ? estimateNotional(estimatePrice, qtyCheck.value) : null;
  const buyBlocked = side === "BUY" && !buyable;
  const precheck =
    qtyCheck.ok && !buyBlocked
      ? ticketPrecheck({
          symbol,
          side,
          qty: qtyCheck.value,
          estimate,
          buyingPower,
          sellable,
          reserve:
            side === "BUY" && type === "MARKET" && refPrice && marketBuyBuffer
              ? reserveWithBuffer(refPrice, qtyCheck.value, marketBuyBuffer)
              : null,
          ...(marketBuyBuffer ? { buffer: marketBuyBuffer } : {}),
        })
      : null;
  const ready = qtyCheck.ok && (limitCheck === null || limitCheck.ok) && !buyBlocked && !precheck;

  const place = useMutation({
    mutationFn: () =>
      api.placeOrder({
        symbol,
        side,
        type,
        qty: qtyCheck.ok ? qtyCheck.value : 0,
        ...(limitCheck?.ok ? { limitPrice: limitCheck.value } : {}),
        idempotencyKey,
      }),
    onSuccess: ({ order }) => {
      setPlaced(order);
      setReviewing(false);
      setQty("");
      setLimitPrice("");
      setIdempotencyKey(crypto.randomUUID());
      // The placement reserved cash (buy) or shares (sell), and a market
      // order may already have filled: every cash-derived view is stale.
      invalidateOrderViews(queryClient, order.id);
    },
    onError: (err) => {
      const failure = placeOrderError(err);
      setError(failure);
      // A refusal needs an edit; an uncertain outcome stays on review so the
      // same key can be confirmed again (a replay, never a second order).
      if (!failure.retryable) setReviewing(false);
    },
  });

  // The user edits the ticket -> it becomes a NEW order intent (fresh key).
  function edit(apply: () => void) {
    apply();
    setError(null);
    setReviewing(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  const sideWord = side === "BUY" ? "Buy" : "Sell";
  const typeWord = formatOrderType(type, limitCheck?.ok ? limitCheck.value : null);
  const quoteLabel = side === "BUY" ? "Ask" : "Bid";
  const estimateLabel = `Estimated ${side === "BUY" ? "cost" : "proceeds"}`;
  const qtyError = qtyCheck.ok ? null : qtyCheck.error;
  const limitError = limitCheck && !limitCheck.ok ? limitCheck.error : null;

  return (
    <section className="ar-card" aria-labelledby={`${uid}-title`}>
      <h2 className="ar-heading" id={`${uid}-title`} style={{ marginBottom: 16 }}>
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
              onClick={() => edit(() => setSide(s))}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        {/* Order type: the system's SegmentedControl (two to four mutually
            exclusive choices are never a dropdown), same as Buy | Sell. */}
        <div className="ar-field">
          <span className="ar-field__label" id={`${uid}-type`}>
            Order type
          </span>
          <div
            className="ar-seg ar-seg--block"
            role="group"
            aria-labelledby={`${uid}-type`}
            aria-describedby={quote ? undefined : `${uid}-type-help`}
          >
            {(
              [
                ["MARKET", "Market"],
                ["LIMIT", "Limit (day)"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                className={`ar-seg__item${type === t ? " is-selected" : ""}`}
                aria-pressed={type === t}
                // a market order needs a live quote to estimate against
                disabled={t === "MARKET" && !quote}
                onClick={() => edit(() => setType(t))}
              >
                {label}
              </button>
            ))}
          </div>
          {!quote ? (
            <span id={`${uid}-type-help`} className="ar-field__help">
              Market orders need a live quote. Use a limit order.
            </span>
          ) : null}
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
              autoComplete="off"
              value={qty}
              aria-invalid={qtyError ? true : undefined}
              onChange={(e) => {
                const next = sanitizeQtyInput(e.target.value);
                edit(() => setQty(next));
              }}
              aria-describedby={`${uid}-available${qtyError ? ` ${uid}-qty-error` : ""}`}
            />
          </div>
          {qtyError ? (
            <span id={`${uid}-qty-error`} className="field-error">
              {qtyError}
            </span>
          ) : null}
          <span id={`${uid}-available`} className="ar-field__help tabular">
            {side === "BUY"
              ? `Buying power ${formatMoney(buyingPower)}`
              : `Sellable ${formatShares(sellable)}`}
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
                autoComplete="off"
                value={limitPrice}
                aria-invalid={limitError ? true : undefined}
                aria-describedby={limitError ? `${uid}-limit-error` : undefined}
                onChange={(e) => {
                  const next = sanitizePriceInput(e.target.value);
                  edit(() => setLimitPrice(next));
                }}
              />
            </div>
            {limitError ? (
              <span id={`${uid}-limit-error`} className="field-error">
                {limitError}
              </span>
            ) : null}
            {quote ? (
              <span className="ar-field__help tabular">Last {formatPrice(quote.last)}</span>
            ) : null}
          </div>
        ) : null}

        {!reviewing ? (
          <div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{quoteLabel}</span>
              <span className="ar-ticket-row__value">
                {refPrice ? formatPrice(refPrice) : "N/A"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{estimateLabel}</span>
              <span className="ar-ticket-row__value">
                {estimate ? formatMoney(estimate) : "N/A"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Estimated fees</span>
              <span className="ar-ticket-row__value">$0.00</span>
            </div>
          </div>
        ) : null}

        {buyBlocked ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {symbol} is no longer tradable. Shares you hold can still be sold.
          </p>
        ) : null}
        {precheck && !error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {precheck}
          </p>
        ) : null}
        {error && !reviewing ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error.message}
          </p>
        ) : null}

        {!reviewing ? (
          <button
            type="button"
            className="ar-btn ar-btn--primary ar-btn--block"
            disabled={!ready || place.isPending}
            onClick={() => {
              setError(null);
              setReviewing(true);
            }}
          >
            Review order
          </button>
        ) : (
          <div className="review-summary">
            <p className="ar-body-strong" style={{ margin: "0 0 4px" }}>
              {sideWord} {qtyCheck.ok ? qtyCheck.value : ""} {symbol} · {typeWord} · est.{" "}
              {estimate ? formatMoney(estimate) : "N/A"}
            </p>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Order type</span>
              <span className="ar-ticket-row__value">{typeWord} · day</span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Quantity</span>
              <span className="ar-ticket-row__value">
                {qtyCheck.ok ? formatShares(qtyCheck.value) : "N/A"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{quoteLabel}</span>
              <span className="ar-ticket-row__value">
                {refPrice ? formatPrice(refPrice) : "N/A"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">{estimateLabel}</span>
              <span className="ar-ticket-row__value">
                {estimate ? formatMoney(estimate) : "N/A"}
              </span>
            </div>
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Estimated fees</span>
              <span className="ar-ticket-row__value">$0.00</span>
            </div>
            <p className="ar-caption ar-secondary" style={{ margin: "12px 0 0" }}>
              Practice account, simulated money. Execution price may differ from the displayed
              quote.
            </p>
            {error ? (
              <p role="alert" className="field-error" style={{ margin: "12px 0 0" }}>
                {error.message}
              </p>
            ) : null}
            <div className="ar-btn-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="ar-btn ar-btn--secondary"
                disabled={place.isPending}
                onClick={() => setReviewing(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="ar-btn ar-btn--primary"
                disabled={place.isPending || !ready}
                onClick={() => {
                  if (place.isPending) return; // one request per click, same key on retry
                  setError(null);
                  place.mutate();
                }}
              >
                {place.isPending ? "Placing…" : "Confirm order"}
              </button>
            </div>
          </div>
        )}

        {placed ? <PlacedOrderChip key={placed.id} placed={placed} /> : null}
      </div>
    </section>
  );
}

/** Live order chip: advances via polling until terminal — no manual refresh. */
function PlacedOrderChip({ placed }: { placed: OrderDto }) {
  const { data } = useQuery({
    queryKey: ["order", placed.id],
    queryFn: () => api.orderDetail(placed.id),
    refetchInterval: (query) => {
      const state = query.state.data?.order.state;
      return state && isOrderTerminal(state) ? false : 1_500;
    },
  });
  const order = data?.order ?? placed;
  // Each fill and the final state move cash and shares: refresh every view
  // derived from them (relative to the placement response already handled).
  useRefreshOnOrderProgress(orderProgressSignature([order]), orderProgressSignature([placed]));

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
      <Link
        href={`/orders/${order.id}`}
        className="ar-link ar-caption"
        style={{ justifySelf: "start" }}
      >
        View order details
      </Link>
    </div>
  );
}
