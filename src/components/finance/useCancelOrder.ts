"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { invalidateOrderViews } from "./order-queries";

/**
 * Cancel-an-order request, shared by the orders list and the order detail
 * page. Cancelling is a REQUEST to the venue: the order moves to "Cancel
 * pending" and the outcome (cancelled, or a fill that won the race) arrives
 * as an event — so every view that shows the order, the reservation it held,
 * or the cash it may have moved is refreshed, not optimistically rewritten.
 * The polled views pick up the later outcome (useRefreshOnOrderProgress).
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (orderId: string) => api.cancelOrder(orderId),
    onSettled: (_data, _err, orderId) => invalidateOrderViews(queryClient, orderId),
  });
  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "The order could not be cancelled. Try again."
    : null;
  return {
    cancel: (orderId: string) => mutation.mutate(orderId),
    /** The order currently being cancelled (null when idle). */
    pendingId: mutation.isPending ? (mutation.variables ?? null) : null,
    /** The order whose cancel failed, with the reason to show beside it. */
    failedId: mutation.isError ? (mutation.variables ?? null) : null,
    errorMessage,
  };
}
