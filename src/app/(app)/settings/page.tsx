"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TradingModeSwitch } from "@/components/trading-mode-switch";
import { useTradingMode } from "@/components/trading-mode";
import { Money } from "@/components/finance/Money";
import { api, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const mode = useTradingMode();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [confirmText, setConfirmText] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const reset = useMutation({
    mutationFn: api.resetAccount,
    onSuccess: () => {
      setConfirmText("");
      void queryClient.invalidateQueries();
    },
  });

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: "36rem" }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Settings</h1>
      </div>

      <section
        aria-label="Account"
        className="ar-card"
        style={{ paddingTop: 16, paddingBottom: 8 }}
      >
        <h2 className="ar-heading">Account</h2>
        <div className="ar-list">
          <div className="ar-row ar-row--setting">
            <div className="ar-row__main">
              <span className="ar-row__title">Signed in as</span>
              <span className="ar-row__sub">
                {me?.user.name} · {me?.user.email}
              </span>
            </div>
          </div>
          <div className="ar-row ar-row--setting">
            <div className="ar-row__main">
              <span className="ar-row__title">Paper cash</span>
              <span className="ar-row__sub">Simulated balance</span>
            </div>
            <div className="ar-row__end">
              <span className="ar-row__value">
                {me?.account ? <Money value={me.account.cash} /> : "—"}
              </span>
            </div>
          </div>
          <div className="ar-row ar-row--setting">
            <div className="ar-row__main">
              <span className="ar-row__title">Appearance</span>
              <span className="ar-row__sub">Light or dark</span>
            </div>
            <div className="ar-row__end">
              <ThemeToggle />
            </div>
          </div>
          <div className="ar-row ar-row--setting">
            <div className="ar-row__main">
              <span className="ar-row__title">Session</span>
            </div>
            <div className="ar-row__end">
              <button
                type="button"
                className="ar-btn ar-btn--secondary ar-btn--compact"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  // Leave for /signin even if the call fails: a dead session
                  // lands there anyway, and a live one is re-checked on arrival.
                  void authClient.signOut().finally(() => {
                    queryClient.clear();
                    window.location.href = "/signin";
                  });
                }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Trading mode" className="ar-card" style={{ display: "grid", gap: 12 }}>
        <h2 className="ar-heading">Trading mode</h2>
        <p className="ar-body ar-secondary" style={{ margin: 0 }}>
          Practice trades simulated money on real market prices. Live is where real money will be
          traded — it isn&apos;t enabled yet, and switching shows a preview of the live experience.
          The two are always kept visually distinct so a practice result can never be mistaken for a
          real one.
        </p>
        <div>
          <TradingModeSwitch />
        </div>
        <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
          Currently in {mode === "live" ? "live preview" : "practice"} mode.
        </p>
      </section>

      <section aria-label="Reset account" className="ar-card" style={{ display: "grid", gap: 12 }}>
        <h2 className="ar-heading">Reset paper account</h2>
        <p className="ar-body ar-secondary" style={{ margin: 0 }}>
          Cancels open orders, archives the current account (history is preserved and stays visible
          in Activity), and starts a fresh account at the original balance. This cannot be undone.
        </p>
        <div className="ar-field">
          <label className="ar-field__label" htmlFor="reset-confirm">
            Type RESET to confirm
          </label>
          <div className="ar-input">
            <input
              id="reset-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-danger"
            disabled={confirmText !== "RESET" || reset.isPending}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? "Resetting…" : "Reset account"}
          </button>
        </div>
        {reset.isSuccess ? (
          <p role="status" style={{ margin: 0 }}>
            {reset.data.account.status === "ACTIVE"
              ? "Account reset — fresh balance ready."
              : "Account reset — your fresh balance is being funded and appears on the dashboard in a few minutes."}
          </p>
        ) : null}
        {reset.isError ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {reset.error instanceof ApiError
              ? reset.error.message
              : "The account could not be reset — try again."}
          </p>
        ) : null}
      </section>

      <section id="data" aria-label="Data limitations" className="ar-card">
        <h2 className="ar-heading" style={{ marginBottom: 8 }}>
          About this data
        </h2>
        <p className="ar-body ar-secondary" style={{ margin: 0 }}>
          Arthosrot is a paper-trading simulation. Displayed quotes come from a limited feed (IEX
          via Alpaca where configured) and may differ from consolidated market data and from
          simulated execution prices. There is no real market impact, queue position, or settlement.
          Nothing here is investment advice. Full details in the repository&apos;s LIMITATIONS
          document.
        </p>
      </section>
    </div>
  );
}
