"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icons/Icon";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { relativeAge } from "@/lib/format";

/**
 * Global pipeline-health banner (docs/design/UX_PATTERNS.md): shown only when
 * something is degraded — never fakes "live" state. Driven by the cached
 * system-status endpoint (no vendor calls spent on monitoring). The system's
 * warning Banner: tint, icon plus text, full width. It describes the PAPER
 * order pipeline, so live preview (which has no orders) never shows it.
 */
export function StatusBanner() {
  const mode = useTradingMode();
  const { data, isError } = useQuery({
    queryKey: ["system-status"],
    queryFn: api.systemStatus,
    refetchInterval: 60_000,
    retry: 1,
    enabled: mode === "paper",
  });

  if (mode === "live") return null;

  if (isError) {
    return (
      <div className="status-banner" role="status">
        <Icon name="alert" size={20} />
        <span>System status unavailable. Data on this page may be delayed.</span>
      </div>
    );
  }
  if (!data) return null;

  const pipelineDegraded = data.broker.pipeline !== "LIVE";
  if (!pipelineDegraded) return null;

  return (
    <div className="status-banner" role="status">
      <Icon name="alert" size={20} />
      <span>
        Order updates may be delayed
        {data.broker.lastSyncAt ? <>; last sync {relativeAge(data.broker.lastSyncAt)}</> : null}.
        Recent orders will catch up automatically.
      </span>
    </div>
  );
}
