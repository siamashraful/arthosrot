"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Money } from "@/components/finance/Money";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [confirmText, setConfirmText] = useState("");

  const reset = useMutation({
    mutationFn: api.resetAccount,
    onSuccess: () => {
      setConfirmText("");
      void queryClient.invalidateQueries();
    },
  });

  return (
    <div style={{ display: "grid", gap: "var(--space-6)", maxWidth: "36rem" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Settings</h1>
      </header>

      <section
        aria-label="Account"
        className="card"
        style={{ display: "grid", gap: "var(--space-3)" }}
      >
        <h2 style={{ fontSize: "var(--text-md)" }}>Account</h2>
        <div>
          <div className="field-label">Signed in as</div>
          <div>
            {me?.user.name} · {me?.user.email}
          </div>
        </div>
        <div>
          <div className="field-label">Paper cash</div>
          <div className="tabular">{me?.account ? <Money value={me.account.cash} /> : "—"}</div>
        </div>
        <div>
          <ThemeToggle />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              void authClient.signOut().then(() => {
                window.location.href = "/signin";
              })
            }
          >
            Sign out
          </button>
        </div>
      </section>

      <section
        aria-label="Reset account"
        className="card"
        style={{ display: "grid", gap: "var(--space-3)" }}
      >
        <h2 style={{ fontSize: "var(--text-md)" }}>Reset paper account</h2>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Cancels open orders, archives the current account (history is preserved and stays visible
          in Activity), and starts a fresh account at the original balance. This cannot be undone.
        </p>
        <div className="field">
          <label className="field-label" htmlFor="reset-confirm">
            Type RESET to confirm
          </label>
          <input
            id="reset-confirm"
            className="input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
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
            Account reset — fresh balance ready.
          </p>
        ) : null}
      </section>

      <section id="data" aria-label="Data limitations" className="card">
        <h2 style={{ fontSize: "var(--text-md)" }}>About this data</h2>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Ledgerline is a paper-trading simulation. Displayed quotes come from a limited feed (IEX
          via Alpaca where configured) and may differ from consolidated market data and from
          simulated execution prices. There is no real market impact, queue position, or settlement.
          Nothing here is investment advice. Full details in the repository's LIMITATIONS document.
        </p>
      </section>
    </div>
  );
}
