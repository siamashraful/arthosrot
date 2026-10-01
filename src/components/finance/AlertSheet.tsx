"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { Icon } from "@/components/icons/Icon";
import { SheetHeader } from "@/components/sheet-header";
import { ErrorCard, showError, SkeletonRows } from "@/components/states";
import {
  ALERTS_KEY,
  alertCondition,
  alertErrorMessage,
  alertQueries,
  checkAlertPrice,
  formatAlertPrice,
  MAX_ACTIVE_ALERTS,
  sanitizePriceInput,
} from "@/lib/alerts";
import { api, type AlertDirectionDto, type QuoteDto } from "@/lib/api";
import type { DisplayFreshness } from "@/lib/freshness";

/**
 * Price-alert sheet for the instrument page (ADR-016; UX_PATTERNS.md →
 * Price alerts). The CashTransferSheet shell: native `dialog.sheet`, the
 * shared SheetHeader, an `.ar-seg` Above | Below control, the `.ar-input`
 * price field prefilled with the current price, the current price WITH its
 * freshness chip, and this symbol's active alerts as ListRows with delete.
 *
 * Alerts are notifications about display data: nothing here trades. Prices
 * stay canonical strings; the pre-check compares them exactly (lib/alerts.ts)
 * and the server re-validates everything.
 */
export function AlertSheet({
  symbol,
  quote,
  marketStatus,
  freshness = null,
  triggerClassName = "ar-btn ar-btn--secondary ar-btn--compact",
}: {
  symbol: string;
  /** null when the feed has no quote (delisting): the field starts empty. */
  quote: QuoteDto | null;
  marketStatus: string;
  freshness?: DisplayFreshness | null;
  triggerClassName?: string;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const [direction, setDirection] = useState<AlertDirectionDto>("ABOVE");
  const [input, setInput] = useState("");
  // The prefilled current price always fails the side check (an alert at the
  // current price would fire at once); say so only after the user edits.
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Only fetched while the sheet is open; shares the bell's cache.
  const alerts = useQuery({ ...alertQueries.list(), enabled: open });
  const mine = (alerts.data?.alerts ?? []).filter(
    (a) => a.symbol === symbol && a.state === "ACTIVE",
  );
  const activeTotal = (alerts.data?.alerts ?? []).filter((a) => a.state === "ACTIVE").length;
  const atCap = activeTotal >= MAX_ACTIVE_ALERTS;

  const titleId = `${uid}-title`;
  const inputId = `${uid}-price`;
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;
  const dirLabelId = `${uid}-dir`;

  const last = quote?.last ?? null;
  const check = checkAlertPrice(input, { direction, symbol, last });
  const fieldError = check.ok || !touched ? null : check.error;

  const create = useMutation({
    mutationFn: (price: string) => api.createAlert({ symbol, direction, price }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: [...ALERTS_KEY] });
      setSaved(
        data.created
          ? `Alert set: ${symbol} ${alertCondition(data.alert)}.`
          : `You already have this alert: ${symbol} ${alertCondition(data.alert)}.`,
      );
      setInput("");
      setTouched(false);
    },
    onError: (err) => setSubmitError(alertErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [...ALERTS_KEY] }),
  });

  function openSheet() {
    setDirection("ABOVE");
    // prefilled with the current price: the user nudges it to the level they want
    setInput(last ? stripTrailingZeros(last) : "");
    setTouched(false);
    setSubmitError(null);
    setSaved(null);
    create.reset();
    remove.reset();
    setOpen(true);
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  function edit(value: string) {
    setInput(sanitizePriceInput(value));
    setTouched(true);
    setSubmitError(null);
    setSaved(null);
  }

  function chooseDirection(d: AlertDirectionDto) {
    setDirection(d);
    setTouched(true);
    setSubmitError(null);
    setSaved(null);
  }

  function submit() {
    if (!check.ok || create.isPending || atCap) return;
    setSubmitError(null);
    create.mutate(check.price);
  }

  const sheet = (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onClose={() => setOpen(false)}
    >
      <SheetHeader
        title={`${symbol} price alert`}
        titleId={titleId}
        onClose={() => dialogRef.current?.close()}
      />

      <div className="ar-ticket-row" style={{ marginTop: 4 }}>
        <span className="ar-ticket-row__label">Last price</span>
        <span className="ar-ticket-row__value">{last ? formatAlertPrice(last) : "N/A"}</span>
      </div>
      {quote ? (
        <div style={{ marginTop: 4 }}>
          <FreshnessChip
            ts={quote.ts}
            source={quote.source}
            marketStatus={marketStatus}
            freshness={freshness}
          />
        </div>
      ) : (
        <p className="ar-caption ar-secondary" style={{ margin: "4px 0 0" }}>
          No live quote for {symbol} right now.
        </p>
      )}

      <form
        style={{ display: "grid", gap: 16, marginTop: 16 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="ar-field">
          <span className="ar-field__label" id={dirLabelId}>
            Alert me when the price goes
          </span>
          <div className="ar-seg ar-seg--block" role="group" aria-labelledby={dirLabelId}>
            {(
              [
                ["ABOVE", "Above"],
                ["BELOW", "Below"],
              ] as const
            ).map(([d, label]) => (
              <button
                key={d}
                type="button"
                className={`ar-seg__item${direction === d ? " is-selected" : ""}`}
                aria-pressed={direction === d}
                onClick={() => chooseDirection(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={`ar-field${fieldError ? " is-error" : ""}`}>
          <label className="ar-field__label" htmlFor={inputId}>
            Price
          </label>
          <div className={`ar-input${fieldError ? " is-error" : ""}`}>
            <span className="ar-secondary" aria-hidden>
              $
            </span>
            <input
              ref={inputRef}
              id={inputId}
              className="tabular"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={input}
              onChange={(e) => edit(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : helpId}
            />
          </div>
          {fieldError ? (
            <span id={errorId} role="alert" className="ar-field__help tabular">
              {fieldError}
            </span>
          ) : (
            <span id={helpId} className="ar-field__help">
              {last && !touched
                ? `Starts at the last price. Set the level you want to hear about.`
                : "Checked during market hours on fresh prices. It alerts once, then stops."}
            </span>
          )}
        </div>

        {submitError ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {submitError}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="ar-caption ar-secondary" style={{ margin: 0 }}>
            {saved}
          </p>
        ) : null}
        {atCap ? (
          <p className="ar-caption ar-secondary" style={{ margin: 0 }}>
            You have {MAX_ACTIVE_ALERTS} active alerts, the most allowed. Delete one to add another.
          </p>
        ) : null}

        <button
          type="submit"
          className="ar-btn ar-btn--primary ar-btn--block"
          disabled={!check.ok || create.isPending || atCap}
          aria-busy={create.isPending || undefined}
        >
          {create.isPending ? "Setting alert…" : "Set alert"}
        </button>
      </form>

      <section aria-labelledby={`${uid}-active`} style={{ marginTop: 20 }}>
        <h3 id={`${uid}-active`} className="ar-group-label" style={{ margin: 0 }}>
          Active alerts for {symbol}
        </h3>
        {alerts.isPending && open ? (
          <SkeletonRows count={1} end={false} />
        ) : showError(alerts) ? (
          <ErrorCard
            message="Your alerts couldn't be loaded."
            onRetry={() => void alerts.refetch()}
            retrying={alerts.isFetching}
          />
        ) : mine.length === 0 ? (
          <p className="ar-caption ar-tertiary" style={{ margin: "8px 0 0" }}>
            No active alerts for {symbol}.
          </p>
        ) : (
          <ul className="ar-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {mine.map((a) => {
              const condition = alertCondition(a);
              const deleting = remove.isPending && remove.variables === a.id;
              return (
                <li key={a.id} className="ar-row">
                  <span className="ar-chipicon ar-chipicon--neutral ar-chipicon--sm" aria-hidden>
                    <Icon name="bell" size={18} />
                  </span>
                  <div className="ar-row__main">
                    <span className="ar-row__title tabular">
                      {condition.charAt(0).toUpperCase() + condition.slice(1)}
                    </span>
                    <span className="ar-row__sub">Active</span>
                  </div>
                  <div className="ar-row__end">
                    <button
                      type="button"
                      className="ar-btn ar-btn--icon ar-btn--plain"
                      aria-label={`Delete alert: ${symbol} ${condition}`}
                      disabled={deleting}
                      aria-busy={deleting || undefined}
                      onClick={() => remove.mutate(a.id)}
                    >
                      <Icon name="x" size={20} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {remove.isError ? (
          <p role="alert" className="field-error" style={{ margin: "8px 0 0" }}>
            The alert couldn&apos;t be deleted. Try again.
          </p>
        ) : null}
      </section>
    </dialog>
  );

  return (
    <>
      <button type="button" className={triggerClassName} aria-haspopup="dialog" onClick={openSheet}>
        <Icon name="bell" size={16} />
        Set alert
      </button>
      {mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}

/** "200.5000" → "200.50", "200.1250" → "200.125": the field shows what the price is, no padding. */
function stripTrailingZeros(price: string): string {
  const [whole = "0", frac = ""] = price.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return `${whole}.${trimmed.length <= 2 ? trimmed.padEnd(2, "0") : trimmed}`;
}
