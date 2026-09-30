"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

/**
 * Cancel-an-order request, shared by the orders list and the order detail
 * page. Cancelling is a REQUEST to the venue: the order moves to "Cancel
 * pending" and the outcome (cancelled, or a fill that won the race) arrives
 * as an event — so every view that shows the order, the reservation it held,
 * or the cash it may have moved is refreshed, not optimistically rewritten.
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (orderId: string) => api.cancelOrder(orderId),
    onSettled: (_data, _err, orderId) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "The order could not be cancelled — try again."
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
