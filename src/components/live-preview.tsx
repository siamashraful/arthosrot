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
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Dashboard</h1>
      </div>

      <section aria-label="Live account summary" className="ar-hero">
        <span className="ar-hero__label">Live portfolio value</span>
        <span className="ar-hero__value">
          <Money value="0.00" />
        </span>
        <span className="ar-hero__delta">
          Live mode preview — real trading isn&apos;t enabled yet
        </span>
        <div className="ar-hero__actions">
          <FundingSheet kind="deposit" />
          <FundingSheet kind="withdraw" />
        </div>
      </section>

      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__title">
            Your live portfolio starts after your first deposit
          </span>
          <span className="ar-empty__text">
            Real trading is still being built. Your practice account is safe — switch back anytime
            in <Link href="/settings">Settings</Link>.
          </span>
        </div>
      </div>
    </div>
  );
}

export function LiveEmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">{heading}</h1>
      </div>
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__title">Nothing live yet</span>
          <span className="ar-empty__text">{body}</span>
          <span className="ar-empty__text">
            Switch back to Practice in <Link href="/settings">Settings</Link> to see your paper
            account.
          </span>
        </div>
      </div>
    </div>
  );
}
