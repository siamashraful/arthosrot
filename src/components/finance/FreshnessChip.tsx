"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { relativeAge } from "@/lib/format";
import { isQuoteStale, type DisplayFreshness } from "@/lib/freshness";

/** Wall-clock "now", re-read every `intervalMs` so an age label keeps counting. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Data-freshness disclosure: a price without freshness context is a
 * review-blocking bug (docs/design/UX_PATTERNS.md). A neutral status tag;
 * stale data takes the pending (warning) tag with its clock — icon plus word.
 *
 * The server's display freshness (`freshness`, core's displayFreshness) is
 * the authority at fetch time; between refetches the age keeps ticking and
 * crosses the stale threshold on its own (lib/freshness.ts), so a quote never reads fresh
 * just because the next refetch hasn't landed (or failed).
 */
export function FreshnessChip({
  ts,
  source,
  marketStatus,
  freshness = null,
}: {
  ts: string;
  source: string;
  marketStatus: string;
  freshness?: DisplayFreshness | null;
}) {
  const now = useNow(1_000);
  if (freshness === "at-close" || marketStatus === "CLOSED") {
    return <span className="ar-tag ar-tag--neutral">At close · {source}</span>;
  }
  const stale = isQuoteStale(ts, now, freshness);
  return (
    <span className={stale ? "ar-tag ar-tag--pending" : "ar-tag ar-tag--neutral"}>
      {stale ? <Icon name="clock" size={12} /> : null}
      {stale ? "Stale · " : ""}
      {source} · {relativeAge(ts, now)}
    </span>
  );
}
