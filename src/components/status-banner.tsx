"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { relativeAge } from "@/lib/format";

/**
 * Global pipeline-health banner (docs/design/UX_PATTERNS.md): shown only when
 * something is degraded — never fakes "live" state. Driven by the cached
 * system-status endpoint (no vendor calls spent on monitoring).
 */
export function StatusBanner() {
  const { data, isError } = useQuery({
    queryKey: ["system-status"],
    queryFn: api.systemStatus,
    refetchInterval: 60_000,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="status-banner" role="status">
        System status unavailable — data on this page may be delayed.
      </div>
    );
  }
  if (!data) return null;

  const pipelineDegraded = data.broker.pipeline !== "LIVE";
  if (!pipelineDegraded) return null;

  return (
    <div className="status-banner" role="status">
      Order updates may be delayed — last sync {relativeAge(data.market.asOf)}. Recent orders will
      catch up automatically.
    </div>
  );
}
