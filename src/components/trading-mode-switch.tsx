"use client";

import { useRef } from "react";
import { setTradingMode, useTradingMode } from "./trading-mode";

/**
 * Practice ↔ Live switch (Settings). Entering live opens a confirm sheet that
 * names the mode in words (BRAND.md §5: confirmation copy never relies on the
 * surface); returning to practice is instant. Deliberately neutral — the
 * graduation must not flatter: no badges, no celebration, no readiness claims.
 */
export function TradingModeSwitch() {
  const mode = useTradingMode();
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div
        className="segmented"
        role="group"
        aria-label="Trading mode"
        style={{ maxWidth: "16rem" }}
      >
        <button
          type="button"
          aria-pressed={mode === "paper"}
          onClick={() => setTradingMode("paper")}
        >
          Practice
        </button>
        <button
          type="button"
          aria-pressed={mode === "live"}
          onClick={() => {
            if (mode !== "live") dialogRef.current?.showModal();
          }}
        >
          Live
        </button>
      </div>

      <dialog ref={dialogRef} className="sheet" aria-label="Switch to live trading">
        <h2 style={{ marginTop: 0, fontSize: "var(--text-md)" }}>Switch to live trading</h2>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Live mode is where real money will be traded. Real trading isn&apos;t enabled yet — this
          switches Arthosrot into a visual preview of the live experience.
        </p>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Your practice account is untouched and stays exactly as you left it. You can switch back
          at any time.
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setTradingMode("live");
              dialogRef.current?.close();
            }}
          >
            Switch to live
          </button>
        </div>
      </dialog>
    </>
  );
}
