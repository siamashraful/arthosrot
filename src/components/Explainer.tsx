/**
 * In-place teaching (BRAND.md §9): an explainer lives next to the live thing
 * it explains — never a separate academy. Native <details>: keyboard and
 * screen-reader behavior for free, collapsed by default, zero JS.
 *
 * Voice rules, enforced by the copy itself: explain the mechanism, never
 * predict outcomes; define the term once, in a sentence; no "simply".
 */

const COPY = {
  "buying-power": {
    term: "Why is this less than my cash?",
    body:
      "Open orders reserve the cash they would need if they filled. Buying " +
      "power is your cash minus those reservations, so it can be lower than " +
      "your balance while orders are working. Cancelled and expired orders " +
      "release their reservation.",
  },
  "partial-fill": {
    term: "Why did only part of it fill?",
    body:
      "An order fills when the market has shares at your price — and the " +
      "market may not have your whole quantity at once. Each piece is a " +
      "separate fill at its own price; the rest of the order keeps working " +
      "until it fills, expires, or you cancel it.",
  },
  lifecycle: {
    term: "What do these statuses mean?",
    body:
      "Pending: sent to the venue, not yet confirmed. Open: the venue is " +
      "working it — a limit order rests until the market crosses your " +
      "price. Partially filled: some shares have executed, the rest are " +
      "still working. Filled, Cancelled, Rejected, and Expired are final — " +
      "fills that already happened always stand.",
  },
} as const;

export function Explainer({ topic }: { topic: keyof typeof COPY }) {
  const { term, body } = COPY[topic];
  return (
    <details className="explainer">
      <summary>{term}</summary>
      <p>{body}</p>
    </details>
  );
}
