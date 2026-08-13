"use client";

import { useState } from "react";
import { OrdersTable } from "@/components/finance/OrdersTable";

export default function OrdersPage() {
  const [tab, setTab] = useState<"open" | "all">("open");
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
