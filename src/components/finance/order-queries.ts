"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ApiError, type OrderDto } from "@/lib/api";
import { CASH_DERIVED_KEYS } from "@/lib/queries";

/**
 * Cross-screen freshness for orders. Placing an order reserves cash or
 * shares, cancelling releases them, and every fill moves cash, positions and
 * the ledger — so each of those moments refreshes every cash-derived view
 * (lib/queries CASH_DERIVED_KEYS) plus the order detail caches. Views are
 * refetched from the server, never rewritten optimistically.
 */
export function invalidateOrderViews(queryClient: QueryClient, orderId?: string): void {
  for (const queryKey of CASH_DERIVED_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
  void queryClient.invalidateQueries({ queryKey: orderId ? ["order", orderId] : ["order"] });
}

/** What changes when an order makes progress: its state and its filled quantity. */
export function orderProgressSignature(
  orders: ReadonlyArray<Pick<OrderDto, "id" | "state" | "filledQty">> | undefined,
): string | undefined {
  return orders?.map((o) => `${o.id}:${o.state}:${o.filledQty}`).join("|");
}

/**
 * Refresh the cash-derived views when polled order data shows progress — a
 * state change or a new fill — relative to what was last seen (or to
 * `initial`, the signature the caller already knows about). Runs in an
 * effect, once per change; never on first sight without `initial`.
 */
export function useRefreshOnOrderProgress(signature: string | undefined, initial?: string): void {
  const queryClient = useQueryClient();
  const seen = useRef<string | undefined>(initial);
  useEffect(() => {
    if (signature === undefined) return;
    if (seen.current !== undefined && seen.current !== signature) {
      invalidateOrderViews(queryClient);
    }
    seen.current = signature;
  }, [signature, queryClient]);
}

/** The read failed because the user has no ACTIVE account yet (not opened, or still funding). */
export function isNoActiveAccount(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.body.subcode === "ACCOUNT_NOT_ACTIVE" || err.body.subcode === "NO_ACCOUNT")
  );
}
