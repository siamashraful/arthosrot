"use client";

import { Clock } from "lucide-react";
import { relativeAge } from "@/lib/format";

/**
 * Data-freshness disclosure: a price without freshness context is a
 * review-blocking bug (docs/design/UX_PATTERNS.md). A neutral status tag;
 * stale data takes the pending (warning) tag with its clock — icon plus word.
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
    return <span className="ar-tag ar-tag--neutral">At close · {source}</span>;
  }
  const age = Date.now() - new Date(ts).getTime();
  const stale = age > 120_000;
  return (
    <span className={stale ? "ar-tag ar-tag--pending" : "ar-tag ar-tag--neutral"}>
      {stale ? <Clock className="ar-icon" size={12} aria-hidden /> : null}
      {stale ? "Stale · " : ""}
      {source} · {relativeAge(ts)}
    </span>
  );
}
