"use client";

import Link from "next/link";
import { FundingSheet } from "./finance/FundingSheet";
import { Money } from "./finance/Money";

/**
 * Live-mode preview surfaces (ADR-011). The one unforgivable state is a paper
 * fact rendered as if it were real money, so every live surface shows live's
 * OWN (empty) state and runs no queries against paper data. Real trading does
 * not exist yet; the copy says so plainly on each surface.
 */

export function LiveDashboard() {
  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
      </header>

      <section aria-label="Live account summary" className="field-panel tabular">
        <div className="field-label">Live portfolio value</div>
        <div style={{ fontSize: "var(--text-hero)", fontWeight: 600 }}>
          <Money value="0.00" />
        </div>
        <div
          className="muted"
          style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-4)" }}
        >
          Live mode preview — real trading isn&apos;t enabled yet
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <FundingSheet kind="deposit" />
          <FundingSheet kind="withdraw" />
        </div>
      </section>

      <div className="empty-state">
        <p style={{ marginTop: 0 }}>Your live portfolio starts after your first deposit.</p>
        <p style={{ marginBottom: 0 }}>
          Real trading is still being built. Your practice account is safe — switch back anytime in{" "}
          <Link href="/settings">Settings</Link>.
        </p>
      </div>
    </div>
  );
}

export function LiveEmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>{heading}</h1>
      </header>
      <div className="empty-state">
        <p style={{ marginTop: 0 }}>{body}</p>
        <p style={{ marginBottom: 0 }}>
          Switch back to Practice in <Link href="/settings">Settings</Link> to see your paper
          account.
        </p>
      </div>
    </div>
  );
}
