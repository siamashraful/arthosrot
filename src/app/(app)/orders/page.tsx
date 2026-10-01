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
        body="No live orders. Real order placement isn't available yet."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Orders</h1>
      </div>
      <div
        className="ar-seg"
        role="group"
        aria-label="Order filter"
        style={{ justifySelf: "start" }}
      >
        <button
          type="button"
          className={`ar-seg__item${tab === "open" ? " is-selected" : ""}`}
          aria-pressed={tab === "open"}
          onClick={() => setTab("open")}
        >
          Open
        </button>
        <button
          type="button"
          className={`ar-seg__item${tab === "all" ? " is-selected" : ""}`}
          aria-pressed={tab === "all"}
          onClick={() => setTab("all")}
        >
          History
        </button>
      </div>
      <OrdersTable status={tab} />
    </div>
  );
}
