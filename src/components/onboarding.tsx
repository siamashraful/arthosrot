"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

/**
 * Account onboarding (FR-2): shown when the user has no usable account, on
 * the screen's one hero card. Three states, matching the account lifecycle:
 *  - none:                slider ($MIN–$MAX, whole dollars) + open button
 *  - PROVISIONING:        honest waiting state — venue funding settles
 *                         asynchronously (minutes at the real venue); the
 *                         dashboard's `me` polling flips this to ACTIVE
 *  - PROVISIONING_FAILED: plain error + retry (a fresh account row)
 */

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  if (status === "PROVISIONING") {
    return (
      <section aria-label="Account setup" className="ar-hero onboarding-card" role="status">
        <h2 className="ar-heading" style={{ marginBottom: 8 }}>
          Setting up your account
        </h2>
        <p className="muted" style={{ margin: 0, maxWidth: "48ch" }}>
          Your opening deposit is on its way to the trading venue — simulated bank transfers take
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
      <p className="muted" style={{ margin: "0 0 16px", maxWidth: "52ch" }}>
        Choose your simulated starting cash. Practice money — every trade is real order mechanics,
        none of it is real dollars.
      </p>

      {status === "PROVISIONING_FAILED" ? (
        <p role="alert" className="loss" style={{ margin: "0 0 12px" }}>
          Account setup failed at the trading venue. Nothing was created — try again.
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
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
          className="muted ar-caption tabular"
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
          <p role="alert" className="loss" style={{ margin: 0 }}>
            {provision.error instanceof ApiError
              ? provision.error.message
              : "Something went wrong — try again."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
