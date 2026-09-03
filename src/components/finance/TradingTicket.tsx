"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { api, ApiError, type QuoteDto } from "@/lib/api";
import { formatMoney, formatPrice } from "@/lib/format";
import { Explainer } from "../Explainer";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { FillProgress } from "./FillProgress";

/**
 * The trading ticket (docs/design/UX_PATTERNS.md): labeled Buy/Sell segmented
 * control (brand-neutral — never green/red), explicit review step, single
 * accent confirm, and a live order chip after submission — never optimistic
 * FILLED. Estimates use ask for buys / bid for sells. Estimation only —
 * display math on numbers; all real arithmetic is server-side decimal.
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

  return (
    <section className="card" aria-label={`Trade ${symbol}`}>
      <h2 style={{ fontSize: "var(--text-md)", marginBottom: "var(--space-4)" }}>Trade {symbol}</h2>

      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <div className="segmented" role="group" aria-label="Order side">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => onEdit(setSide)(s)}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${uid}-type`}>
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

        <div className="field">
          <label className="field-label" htmlFor={`${uid}-qty`}>
            Quantity (whole shares)
          </label>
          <input
            id={`${uid}-qty`}
            className="input tabular"
            inputMode="numeric"
            pattern="[0-9]*"
            value={qty}
            onChange={(e) => onEdit(setQty)(e.target.value.replace(/[^0-9]/g, ""))}
            aria-describedby={`${uid}-available`}
          />
          <span id={`${uid}-available`} className="field-label">
            {side === "BUY"
              ? `Buying power ${formatMoney(buyingPower)}`
              : `Sellable ${sellable} shares`}
          </span>
          {side === "BUY" ? <Explainer topic="buying-power" /> : null}
        </div>

        {type === "LIMIT" ? (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-limit`}>
              Limit price
            </label>
            <input
              id={`${uid}-limit`}
              className="input tabular"
              inputMode="decimal"
              value={limitPrice}
              onChange={(e) => onEdit(setLimitPrice)(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        ) : null}

        <dl
          className="tabular"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "var(--space-1) var(--space-3)",
            margin: 0,
            fontSize: "var(--text-sm)",
          }}
        >
          <dt className="muted">{side === "BUY" ? "Ask" : "Bid"}</dt>
          <dd style={{ margin: 0, textAlign: "right" }}>
            {quote ? formatPrice((side === "BUY" ? quote.ask : quote.bid) ?? quote.last) : "—"}
          </dd>
          <dt className="muted">Estimated {side === "BUY" ? "cost" : "proceeds"}</dt>
          <dd style={{ margin: 0, textAlign: "right" }}>
            {estimate ? formatMoney(estimate) : "—"}
          </dd>
          <dt className="muted">Estimated fees</dt>
          <dd style={{ margin: 0, textAlign: "right" }}>$0.00</dd>
        </dl>

        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}

        {!reviewing ? (
          <motion.button
            type="button"
            className="btn btn-primary"
            whileTap={{ scale: 0.97 }}
            disabled={!validQty || !validLimit || place.isPending}
            onClick={() => setReviewing(true)}
          >
            Review order
          </motion.button>
        ) : (
          <div className="review-summary">
            <p style={{ margin: 0, fontWeight: 500 }}>
              {side === "BUY" ? "Buy" : "Sell"} {qtyNum} {symbol} ·{" "}
              {type === "MARKET" ? "Market" : `Limit ${formatPrice(limitPrice)}`} · est.{" "}
              {estimate ? formatMoney(estimate) : "—"}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Paper account — simulated money. Execution price may differ from the displayed quote.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <motion.button
                type="button"
                className="btn btn-primary"
                whileTap={{ scale: 0.97 }}
                disabled={place.isPending}
                onClick={() => place.mutate()}
              >
                {place.isPending ? "Placing…" : "Confirm order"}
              </motion.button>
              <button type="button" className="btn btn-ghost" onClick={() => setReviewing(false)}>
                Back
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
        void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        void queryClient.invalidateQueries({ queryKey: ["ledger"] });
        return false;
      }
      return 1_500;
    },
  });
  if (!data) return <div className="skeleton" style={{ height: 24 }} />;
  const { order } = data;
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <div
        aria-live="polite"
        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
      >
        <OrderStatusBadge state={order.state} display={order.stateDisplay} />
        <FillProgress filledQty={order.filledQty} qty={order.qty} />
        <span className="tabular" style={{ fontSize: "var(--text-sm)" }}>
          {order.side === "BUY" ? "Buy" : "Sell"} {order.filledQty}/{order.qty} {order.symbol}
        </span>
        {order.rejectReason ? (
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {order.rejectReason}
          </span>
        ) : null}
      </div>
      {order.state === "PARTIALLY_FILLED" ? <Explainer topic="partial-fill" /> : null}
    </div>
  );
}
