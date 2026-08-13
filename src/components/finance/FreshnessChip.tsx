"use client";

import { relativeAge } from "@/lib/format";

/**
 * Data-freshness disclosure: a price without freshness context is a
 * review-blocking bug (docs/design/UX_PATTERNS.md).
 */
export function FreshnessChip({
  ts,
  source,
  marketStatus,
}: {
  ts: string;
  source: string;
  marketStatus: string;
}) {
  if (marketStatus === "CLOSED") {
    return <span className="badge">At close · {source}</span>;
  }
  const age = Date.now() - new Date(ts).getTime();
  const stale = age > 120_000;
  return (
    <span className={stale ? "badge badge-warning" : "badge"}>
      {stale ? "Stale · " : ""}
      {source} · {relativeAge(ts)}
    </span>
  );
}
