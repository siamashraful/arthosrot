"use client";

import { useRef, useState } from "react";

/**
 * Deposit / withdraw sheet for live mode — visually complete, deliberately
 * NON-FUNCTIONAL (ADR-011). The primary action is always disabled and no
 * request is ever sent: live funding does not exist yet, and this sheet never
 * pretends otherwise. When the FundingProvider port (core/funding) gets a
 * real implementation, this is the surface it plugs into.
 *
 * The amount field is display-only — no Money arithmetic client-side
 * (FINANCIAL_INVARIANTS.md); it echoes what the user types, nothing more.
 */
export function FundingSheet({ kind }: { kind: "deposit" | "withdraw" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");

  const title = kind === "deposit" ? "Deposit" : "Withdraw";
  const inputId = `funding-amount-${kind}`;

  return (
    <>
      <button
        type="button"
        className={kind === "deposit" ? "btn btn-primary" : "btn btn-ghost"}
        onClick={() => dialogRef.current?.showModal()}
      >
        {title}
      </button>
      <dialog ref={dialogRef} className="sheet" aria-label={title}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--text-md)" }}>{title}</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
          <div className="field">
            <label className="field-label" htmlFor={inputId}>
              Amount
            </label>
            <input
              id={inputId}
              className="input tabular"
              inputMode="decimal"
              placeholder="$0.00"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="field-label">Funding source</div>
            <button type="button" className="btn btn-ghost" disabled style={{ width: "100%" }}>
              Link a bank account — available at launch
            </button>
          </div>

          {kind === "withdraw" ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "var(--text-sm)",
              }}
            >
              <span className="muted">Available to withdraw</span>
              <span className="tabular">$0.00</span>
            </div>
          ) : null}

          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Live funding isn&apos;t available yet. This is a preview of the {title.toLowerCase()}{" "}
            flow — no money moves.
          </p>

          <div>
            <button type="button" className="btn btn-primary" disabled style={{ width: "100%" }}>
              {kind === "deposit" ? "Deposit funds" : "Withdraw funds"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
