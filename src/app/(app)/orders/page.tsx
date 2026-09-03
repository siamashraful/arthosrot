"use client";

import { useState } from "react";
import { OrdersTable } from "@/components/finance/OrdersTable";
import { LiveEmptyState } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";

export default function OrdersPage() {
  const mode = useTradingMode();
  const [tab, setTab] = useState<"open" | "all">("open");

  // Paper orders must never read as live orders (ADR-011).
  if (mode === "live") {
    return (
      <LiveEmptyState
        heading="Orders"
        body="No live orders — real order placement isn't available yet."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Orders</h1>
      </header>
      <div
        className="segmented"
        role="group"
        aria-label="Order filter"
        style={{ maxWidth: "16rem" }}
      >
        <button aria-pressed={tab === "open"} onClick={() => setTab("open")}>
          Open
        </button>
        <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>
          History
        </button>
      </div>
      <OrdersTable status={tab} />
    </div>
  );
}
