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
  // key={state}: a state change remounts the span, playing the reed's beat
  // exactly once per transition — states snap, they never fade (BRAND.md §8).
  return (
    <span key={state} className={TONE[state] ?? "badge"}>
      {display}
    </span>
  );
}
