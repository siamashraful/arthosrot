"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons/Icon";
import { api, ApiError, type AccountCashDto, type CashTransferDto } from "@/lib/api";
import {
  addMoney,
  checkTransferAmount,
  percentOf,
  sanitizeAmountInput,
  subtractMoney,
  transferErrorMessage,
  type TransferDirection,
} from "@/lib/cash-transfer";
import { formatMoney } from "@/lib/format";
import { CASH_DERIVED_KEYS } from "@/lib/queries";

/**
 * Paper-account deposit / withdraw sheet (docs/design/UX_PATTERNS.md →
 * Settings · Cash). The paper twin of the live FundingSheet shell: same
 * native `dialog.sheet`, `.ar-input` amount and pill buttons — but this one
 * moves simulated money. Flow: amount (+ quick chips, live pre-checks that
 * mirror the server's rules) → review rows → one confirm → quiet result.
 *
 * Money stays canonical strings; every comparison and the "cash after" row are
 * exact cents (lib/cash-transfer.ts). The server re-validates everything.
 *
 * One Idempotency-Key per review: a double-click or a network retry of the
 * same submission replays instead of moving the money twice; editing the
 * amount (Back) is a new intent and gets a new key.
 */

type Step = "edit" | "review" | "done";

const DEPOSIT_CHIPS = ["500.00", "1000.00", "5000.00"];
const WITHDRAW_CHIPS = [
  { label: "25%", percent: 25 },
  { label: "50%", percent: 50 },
  { label: "Max", percent: 100 },
];

/** "$1,000" for a whole-dollar chip label. */
const wholeDollars = (amount: string) => formatMoney(amount).replace(/\.00$/, "");

export function CashTransferSheet({
  direction,
  cash,
  disabled = false,
  describedBy,
  triggerClassName,
}: {
  direction: TransferDirection;
  cash: AccountCashDto;
  disabled?: boolean;
  describedBy?: string;
  triggerClassName: string;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>("edit");
  const [input, setInput] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ transfer: CashTransferDto; cashAfter: string } | null>(
    null,
  );

  const isDeposit = direction === "DEPOSIT";
  const title = isDeposit ? "Add cash" : "Withdraw cash";
  const titleId = `${uid}-title`;
  const inputId = `${uid}-amount`;
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;

  const check = checkTransferAmount(input, {
    direction,
    minAmount: cash.limits.minAmount,
    maxPerTransfer: cash.limits.maxPerTransfer,
    depositRemainingToday: cash.limits.depositRemainingToday,
    withdrawable: cash.withdrawable,
  });
  const amount = check.ok ? check.amount : null;
  const fieldError = check.ok ? null : check.error;

  const submit = useMutation({
    mutationFn: (vars: { amount: string; key: string }) =>
      api.createTransfer(direction, vars.amount, vars.key),
    onSuccess: (data) => {
      // The response carries the fresh cash snapshot: seed it, refetch the rest.
      queryClient.setQueryData(["account-cash"], data.cash);
      for (const queryKey of CASH_DERIVED_KEYS) {
        if (queryKey[0] === "account-cash") continue;
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
      setResult({ transfer: data.transfer, cashAfter: data.cash.cash });
      setStep("done");
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : 0;
      const message = transferErrorMessage(
        err instanceof ApiError
          ? { status, code: err.body.code, subcode: err.body.subcode }
          : { status },
      );
      // Limits or the withdrawable amount may have moved under us.
      void queryClient.invalidateQueries({ queryKey: ["account-cash"] });
      if (status === 409) {
        // The key is spent on a different body: start over with a fresh intent.
        setInput("");
        setIdempotencyKey(null);
        setStep("edit");
      }
      setSubmitError(message);
    },
  });

  // A background refresh (CashCard polls while a transfer is pending) can
  // move the limits under an open review; never show a blank review — drop
  // back to the amount step, where the field error explains why.
  useEffect(() => {
    if (step === "review" && !amount && !submit.isPending) setStep("edit");
  }, [step, amount, submit.isPending]);

  // Move focus with the step so keyboard and screen-reader users follow it.
  useEffect(() => {
    if (!dialogRef.current?.open) return;
    if (step === "edit") inputRef.current?.focus();
    else stepHeadingRef.current?.focus();
  }, [step]);

  function open() {
    setStep("edit");
    setInput("");
    setIdempotencyKey(null);
    setSubmitError(null);
    setResult(null);
    submit.reset();
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  function edit(value: string) {
    setInput(sanitizeAmountInput(value));
    setSubmitError(null);
  }

  function review() {
    if (!amount) return;
    setIdempotencyKey(crypto.randomUUID()); // once per review — reused by retries
    setSubmitError(null);
    setStep("review");
  }

  function back() {
    setIdempotencyKey(null);
    setSubmitError(null);
    setStep("edit");
  }

  function confirm() {
    if (!amount || !idempotencyKey || submit.isPending) return;
    setSubmitError(null);
    submit.mutate({ amount, key: idempotencyKey });
  }

  const cashAfter = amount
    ? isDeposit
      ? addMoney(cash.cash, amount)
      : subtractMoney(cash.cash, amount)
    : null;

  const sheet = (
    <dialog ref={dialogRef} className="sheet" aria-labelledby={titleId}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 id={titleId} className="ar-sheet__title" style={{ margin: 0 }}>
          {title}
        </h2>
        <button
          type="button"
          className="ar-btn ar-btn--icon"
          aria-label="Close"
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {step === "edit" ? (
        <form
          style={{ display: "grid", gap: 16, marginTop: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <div className={`ar-field${fieldError ? " is-error" : ""}`}>
            <label className="ar-field__label" htmlFor={inputId}>
              Amount
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
            {/* The system's field: the help line turns into the error line
                (.ar-field.is-error .ar-field__help) — never both at once. */}
            {fieldError ? (
              <span id={errorId} role="alert" className="ar-field__help tabular">
                {fieldError}
              </span>
            ) : (
              <span id={helpId} className="ar-field__help tabular">
                {isDeposit
                  ? `${formatMoney(cash.limits.minAmount)} to ${formatMoney(
                      cash.limits.maxPerTransfer,
                    )} per transfer · ${formatMoney(cash.limits.depositRemainingToday)} left to add today`
                  : `Available to withdraw ${formatMoney(cash.withdrawable)}`}
              </span>
            )}
          </div>

          <div className="ar-chip-row" role="group" aria-label="Quick amounts">
            {isDeposit
              ? DEPOSIT_CHIPS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="ar-chip tabular"
                    onClick={() => edit(value)}
                  >
                    {wholeDollars(value)}
                  </button>
                ))
              : WITHDRAW_CHIPS.map(({ label, percent }) => (
                  <button
                    key={label}
                    type="button"
                    className="ar-chip"
                    onClick={() => edit(percentOf(cash.withdrawable, percent))}
                  >
                    {label}
                  </button>
                ))}
          </div>

          {submitError ? (
            <p role="alert" className="field-error" style={{ margin: 0 }}>
              {submitError}
            </p>
          ) : null}

          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            Simulated money. No real funds move.
          </p>

          <button type="submit" className="ar-btn ar-btn--primary ar-btn--block" disabled={!amount}>
            Review
          </button>
        </form>
      ) : null}

      {step === "review" && amount && cashAfter ? (
        <div className="review-summary" style={{ marginTop: 12 }}>
          <h3
            ref={stepHeadingRef}
            tabIndex={-1}
            className="ar-body-strong"
            style={{ margin: "0 0 4px", outline: "none" }}
          >
            {isDeposit ? "Add" : "Withdraw"} {formatMoney(amount)} · Practice account
          </h3>
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Amount</span>
            <span className="ar-ticket-row__value">{formatMoney(amount)}</span>
          </div>
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Cash now</span>
            <span className="ar-ticket-row__value">{formatMoney(cash.cash)}</span>
          </div>
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Cash after</span>
            <span className="ar-ticket-row__value">{formatMoney(cashAfter)}</span>
          </div>
          {!isDeposit ? (
            <div className="ar-ticket-row">
              <span className="ar-ticket-row__label">Available to withdraw after</span>
              <span className="ar-ticket-row__value">
                {formatMoney(subtractMoney(cash.withdrawable, amount))}
              </span>
            </div>
          ) : null}
          <p className="ar-caption ar-secondary" style={{ margin: "12px 0 0" }}>
            {isDeposit
              ? "The deposit is added to your cash when it settles, usually right away. "
              : ""}
            Simulated money. No real funds move.
          </p>
          {submitError ? (
            <p role="alert" className="field-error" style={{ margin: "12px 0 0" }}>
              {submitError}
            </p>
          ) : null}
          <div className="ar-btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="ar-btn ar-btn--secondary"
              disabled={submit.isPending}
              onClick={back}
            >
              Back
            </button>
            <button
              type="button"
              className="ar-btn ar-btn--primary"
              disabled={submit.isPending}
              aria-busy={submit.isPending || undefined}
              onClick={confirm}
            >
              {submit.isPending
                ? isDeposit
                  ? "Adding…"
                  : "Withdrawing…"
                : isDeposit
                  ? "Confirm deposit"
                  : "Confirm withdrawal"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <TransferResult
          transfer={result.transfer}
          cashAfter={result.cashAfter}
          headingRef={stepHeadingRef}
          onDone={() => dialogRef.current?.close()}
        />
      ) : null}
    </dialog>
  );

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={open}
      >
        <Icon name={isDeposit ? "arrow-down-left" : "arrow-up-right"} size={18} />
        {isDeposit ? "Add cash" : "Withdraw"}
      </button>
      {mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}

/**
 * The quiet outcome (system: no flourish on money events). Settled → the
 * gain-tint check and one line; pending → the Pending tag and when to expect
 * it; failed → what happened, and that no money moved.
 */
function TransferResult({
  transfer,
  cashAfter,
  headingRef,
  onDone,
}: {
  transfer: CashTransferDto;
  cashAfter: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onDone: () => void;
}) {
  const isDeposit = transfer.direction === "DEPOSIT";
  const noun = isDeposit ? "Deposit" : "Withdrawal";
  const amount = formatMoney(transfer.amount);

  let heading: string;
  let body: string;
  let mark: ReactNode = null;
  if (transfer.state === "SETTLED") {
    heading = isDeposit ? `Added ${amount}` : `Withdrew ${amount}`;
    body = `Your cash balance is now ${formatMoney(cashAfter)}.`;
    mark = (
      <span className="ar-success-mark" aria-hidden>
        <Icon name="check" size={32} stroke={2} />
      </span>
    );
  } else if (transfer.state === "PENDING") {
    heading = `${noun} pending`;
    body = `${amount}: the sandbox usually settles in a few minutes. It's listed under Pending transfers until then.`;
    mark = (
      <span className="ar-tag ar-tag--pending">
        <Icon name="clock" size={12} stroke={2.25} />
        Pending
      </span>
    );
  } else {
    // A definite venue refusal arrives as a 201 with state FAILED — it is a
    // failure, in the loss tone (the system's failure chip: loss + alert).
    heading = "Transfer didn't go through";
    body = `${transfer.failureReason ?? "The venue didn't accept it."} No money moved.`;
    mark = (
      <span className="ar-chipicon ar-chipicon--loss" aria-hidden>
        <Icon name="alert" />
      </span>
    );
  }
  const failed = transfer.state !== "SETTLED" && transfer.state !== "PENDING";

  return (
    <div
      role={failed ? "alert" : "status"}
      style={{
        display: "grid",
        gap: 12,
        justifyItems: "center",
        textAlign: "center",
        marginTop: 16,
      }}
    >
      {mark}
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="ar-heading tabular"
        style={{ margin: 0, outline: "none" }}
      >
        {heading}
      </h3>
      <p className="ar-sheet__text" style={{ margin: 0 }}>
        {body}
      </p>
      <div className="ar-sheet__actions" style={{ width: "100%", marginTop: 8 }}>
        <button type="button" className="ar-btn ar-btn--primary ar-btn--block" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
