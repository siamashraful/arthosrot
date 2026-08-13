/** Lifecycle badge covering all ten canonical states (EXECUTION.md). */
const TONE: Record<string, string> = {
  PENDING_SUBMISSION: "badge",
  ACKNOWLEDGED: "badge badge-accent",
  ACCEPTED: "badge badge-accent",
  PARTIALLY_FILLED: "badge badge-accent",
  FILLED: "badge badge-gain",
  CANCEL_PENDING: "badge badge-warning",
  CANCELLED: "badge",
  REJECTED: "badge badge-loss",
  EXPIRED: "badge",
  SUBMIT_FAILED: "badge badge-loss",
};

export function OrderStatusBadge({ state, display }: { state: string; display: string }) {
  return <span className={TONE[state] ?? "badge"}>{display}</span>;
}
