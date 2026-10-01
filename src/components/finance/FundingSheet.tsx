"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons/Icon";

/**
 * Deposit / withdraw sheet for live mode — visually complete, deliberately
 * NON-FUNCTIONAL (ADR-011). The primary action is always disabled and no
 * request is ever sent: live funding does not exist yet, and this sheet never
 * pretends otherwise. When the FundingProvider port (core/funding) gets a
 * real implementation, this is the surface it plugs into.
 *
 * The amount field is display-only — no Money arithmetic client-side
 * (FINANCIAL_INVARIANTS.md); it echoes what the user types, nothing more.
 *
 * The trigger lives on the hero card (as a hero pill by default), but the
 * sheet is portalled to <body>: the top layer ignores the card's
 * overflow/z-index, yet CSS descendant rules (.ar-hero .ar-btn--primary,
 * .muted) would still cascade into it and paint on-hero controls on a
 * raised sheet.
 */
export function FundingSheet({
  kind,
  triggerClassName = "ar-hero__pill",
}: {
  kind: "deposit" | "withdraw";
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const title = kind === "deposit" ? "Deposit" : "Withdraw";
  const inputId = `funding-amount-${kind}`;
  const triggerIcon = kind === "deposit" ? "arrow-down-left" : "arrow-up-right";

  const sheet = (
    <dialog ref={dialogRef} className="sheet" aria-label={title}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 className="ar-sheet__title" style={{ margin: 0 }}>
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

      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
        <div className="ar-field">
          <label className="ar-field__label" htmlFor={inputId}>
            Amount
          </label>
          <div className="ar-input">
            <input
              id={inputId}
              className="tabular"
              inputMode="decimal"
              placeholder="$0.00"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="ar-field">
          <span className="ar-field__label">Funding source</span>
          <button type="button" className="ar-btn ar-btn--secondary ar-btn--block" disabled>
            Link a bank account — available at launch
          </button>
        </div>

        {kind === "withdraw" ? (
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Available to withdraw</span>
            <span className="ar-ticket-row__value">$0.00</span>
          </div>
        ) : null}

        <p className="ar-sheet__text" style={{ margin: 0 }}>
          Live funding isn&apos;t available yet. This is a preview of the {title.toLowerCase()} flow
          — no money moves.
        </p>
      </div>

      <div className="ar-sheet__actions">
        <button type="button" className="ar-btn ar-btn--primary ar-btn--block" disabled>
          {kind === "deposit" ? "Deposit funds" : "Withdraw funds"}
        </button>
      </div>
    </dialog>
  );

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Icon name={triggerIcon} size={18} />
        {title}
      </button>
      {mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}
