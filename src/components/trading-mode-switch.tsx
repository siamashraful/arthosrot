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
      <div className="ar-seg" role="group" aria-label="Trading mode">
        <button
          type="button"
          className={`ar-seg__item${mode === "paper" ? " is-selected" : ""}`}
          aria-pressed={mode === "paper"}
          onClick={() => setTradingMode("paper")}
        >
          Practice
        </button>
        <button
          type="button"
          className={`ar-seg__item${mode === "live" ? " is-selected" : ""}`}
          aria-pressed={mode === "live"}
          onClick={() => {
            if (mode !== "live") dialogRef.current?.showModal();
          }}
        >
          Live
        </button>
      </div>

      <dialog ref={dialogRef} className="sheet" aria-label="Switch to live trading">
        <h2 className="ar-sheet__title">Switch to live trading</h2>
        <p className="ar-sheet__text" style={{ margin: "0 0 12px" }}>
          Live mode is where real money will be traded. Real trading isn&apos;t enabled yet — this
          switches Arthosrot into a visual preview of the live experience.
        </p>
        <p className="ar-sheet__text" style={{ margin: 0 }}>
          Your practice account is untouched and stays exactly as you left it. You can switch back
          at any time.
        </p>
        <div className="ar-sheet__actions">
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--block"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ar-btn ar-btn--primary ar-btn--block"
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
