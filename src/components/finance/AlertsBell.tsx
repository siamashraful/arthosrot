"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertsPanel } from "@/components/finance/AlertsPanel";
import { Icon } from "@/components/icons/Icon";
import { alertQueries } from "@/lib/alerts";

/**
 * The bell that opens the alerts sheet (ADR-016). Two homes, one component:
 * `topbar` is the phone top bar's 40px icon button (beside Search and
 * Settings); `sidebar` is a desktop sidebar row with its label.
 *
 * Unread alerts show as a small dot, never a number: the system has no count
 * badges (no streaks, no badges, no activation pressure — BRAND.md), and the
 * tab bar is never badged. The count is still spoken: it is in the button's
 * accessible name. The dot is `--info` (an informational state, not money).
 */
export function AlertsBell({ variant = "topbar" }: { variant?: "topbar" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const unread = useQuery(alertQueries.unreadCount());
  const count = unread.data?.unreadCount ?? 0;
  const label = count > 0 ? `Alerts, ${count} unread` : "Alerts";

  return (
    <>
      <button
        type="button"
        className="nav-link alerts-bell"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="alerts-bell__glyph">
          <Icon name="bell" />
          {count > 0 ? <span className="alerts-bell__dot" aria-hidden /> : null}
        </span>
        {variant === "sidebar" ? (
          // visible text starts the accessible name (label in name)
          <span aria-hidden>Alerts</span>
        ) : null}
      </button>
      <AlertsPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
