"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icons/Icon";
import { api, ApiError } from "@/lib/api";
import { formatWholeDollars as dollars } from "@/lib/format";
import { CASH_DERIVED_KEYS } from "@/lib/queries";

/**
 * Account onboarding (FR-2): shown when the user has no usable account, on
 * the screen's one hero card. Three states, matching the account lifecycle:
 *  - none:                slider ($MIN–$MAX, whole dollars) + open button
 *  - PROVISIONING:        honest waiting state — venue funding settles
 *                         asynchronously (minutes at the real venue); the
 *                         dashboard's `me` polling flips this to ACTIVE
 *  - PROVISIONING_FAILED: plain error + retry (a fresh account row)
 * Errors render as the system's loss Banner: its tint carries its own
 * contrast on the black hero, where caption-size loss text would not.
 */

function LossBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="ar-banner ar-banner--loss">
      <Icon name="alert" size={20} />
      <span className="ar-banner__body">{children}</span>
    </div>
  );
}

export function OnboardingPanel({
  status,
  bounds,
}: {
  status: "NONE" | "PROVISIONING" | "PROVISIONING_FAILED";
  bounds: { minStartingCash: number; maxStartingCash: number; defaultStartingCash: number };
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(bounds.defaultStartingCash);

  const provision = useMutation({
    mutationFn: () => api.provisionAccount(amount),
    // The opening deposit changes every cash-derived view, not just `me`.
    onSuccess: () =>
      Promise.all(CASH_DERIVED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });

  if (status === "PROVISIONING") {
    return (
      <section aria-label="Account setup" className="ar-hero onboarding-card" role="status">
        <h2 className="ar-heading" style={{ marginBottom: 8 }}>
          Setting up your account
        </h2>
        <p className="ar-body ar-secondary" style={{ margin: 0, maxWidth: "48ch" }}>
          Your opening deposit is on its way to the trading venue. Simulated bank transfers take
          about 10–30 minutes to clear. This page updates by itself, and you can safely leave and
          come back.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Open your practice account" className="ar-hero onboarding-card">
      <h2 className="ar-heading" style={{ marginBottom: 8 }}>
        Open your practice account
      </h2>
      <p className="ar-body ar-secondary" style={{ margin: "0 0 16px", maxWidth: "52ch" }}>
        Choose your simulated starting cash. Practice money: every trade is real order mechanics,
        none of it is real dollars.
      </p>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        {status === "PROVISIONING_FAILED" && !provision.isPending ? (
          <LossBanner>
            Account setup failed at the trading venue. Nothing was created, so try again.
          </LossBanner>
        ) : null}
        <div>
          <label className="ar-hero__label" htmlFor="starting-cash">
            Starting cash
          </label>
          <div className="ar-hero__value">{dollars(amount)}</div>
        </div>
        <input
          id="starting-cash"
          type="range"
          min={bounds.minStartingCash}
          max={bounds.maxStartingCash}
          step={500}
          value={amount}
          aria-valuetext={dollars(amount)}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={provision.isPending}
          style={
            {
              // filled-track length for the custom range track (see globals.css)
              "--fill-pct": `${
                bounds.maxStartingCash > bounds.minStartingCash
                  ? ((amount - bounds.minStartingCash) /
                      (bounds.maxStartingCash - bounds.minStartingCash)) *
                    100
                  : 100 // degenerate min===max config: full track, no NaN
              }%`,
            } as React.CSSProperties
          }
        />
        <div
          className="ar-caption ar-secondary tabular"
          style={{ display: "flex", justifyContent: "space-between" }}
        >
          <span>{dollars(bounds.minStartingCash)}</span>
          <span>{dollars(bounds.maxStartingCash)}</span>
        </div>
        <div className="ar-hero__actions">
          <button
            type="button"
            className="ar-btn ar-btn--primary ar-btn--hero"
            onClick={() => provision.mutate()}
            disabled={provision.isPending}
          >
            {provision.isPending ? "Opening…" : "Open practice account"}
          </button>
        </div>
        {provision.isError ? (
          <LossBanner>
            {provision.error instanceof ApiError
              ? provision.error.message
              : "Account setup didn't go through. Check your connection and try again."}
          </LossBanner>
        ) : null}
      </div>
    </section>
  );
}
