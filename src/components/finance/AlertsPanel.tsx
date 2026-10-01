"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons/Icon";
import { SheetHeader } from "@/components/sheet-header";
import { EmptyCard, ErrorCard, showError, SkeletonRows } from "@/components/states";
import {
  ALERTS_KEY,
  alertErrorMessage,
  alertQueries,
  alertTitle,
  formatAlertPrice,
  formatAlertTime,
} from "@/lib/alerts";
import { api, type PriceAlertDto } from "@/lib/api";
import { formatDate } from "@/lib/format";

/**
 * The alerts sheet the bell opens (ADR-016; UX_PATTERNS.md → Price alerts):
 * triggered alerts first ("AAPL crossed above $210.00", the observed price
 * and its market time), then active ones; each row deletes, a triggered one
 * can be re-armed (a new alert with the same terms). Opening the sheet marks
 * what it shows as read; rows that were unread keep a "New" tag until the
 * sheet closes, so the user still sees what changed.
 *
 * In-app only (email is a later channel). Quiet by design: no celebration,
 * no colour for direction (BUY/SELL-style neutrality), one semantic chip.
 */
export function AlertsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const alerts = useQuery({ ...alertQueries.list(), enabled: open });
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const markedRef = useRef(false);

  // The parent owns `open`; the native dialog owns focus trap and Esc.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      markedRef.current = false;
      setFreshIds(new Set());
    }
  }, [open, mounted]);

  const markRead = useMutation({
    mutationFn: (ids: string[]) => api.markAlertsRead(ids),
    onSuccess: (data) =>
      queryClient.setQueryData(alertQueries.unreadCount().queryKey, {
        unreadCount: data.unreadCount,
      }),
  });

  // Mark read on open: exactly the unread alerts this sheet is showing.
  useEffect(() => {
    if (!open || !alerts.data || markedRef.current) return;
    markedRef.current = true;
    const unread = alerts.data.alerts
      .filter((a) => a.state === "TRIGGERED" && a.readAt === null)
      .map((a) => a.id);
    setFreshIds(new Set(unread));
    if (unread.length > 0) markRead.mutate(unread);
    // markRead is stable enough: the ref guards this to once per open
  }, [open, alerts.data, markRead]);

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [...ALERTS_KEY] }),
  });
  const rearm = useMutation({
    mutationFn: (a: PriceAlertDto) =>
      api.createAlert({ symbol: a.symbol, direction: a.direction, price: a.threshold }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [...ALERTS_KEY] }),
  });

  const titleId = `${uid}-title`;
  const list = alerts.data?.alerts ?? [];
  const triggered = list.filter((a) => a.state === "TRIGGERED");
  const active = list.filter((a) => a.state === "ACTIVE");

  let body;
  if (alerts.isPending) {
    body = <SkeletonRows count={3} end={false} />;
  } else if (showError(alerts)) {
    body = (
      <ErrorCard
        message="Your alerts couldn't be loaded."
        onRetry={() => void alerts.refetch()}
        retrying={alerts.isFetching}
      />
    );
  } else if (list.length === 0) {
    body = (
      <EmptyCard
        title="No price alerts yet"
        message="Open a stock and choose Set alert to hear when it crosses a price."
      />
    );
  } else {
    body = (
      <>
        {triggered.length > 0 ? (
          <AlertGroup label="Triggered" labelId={`${uid}-triggered`}>
            {triggered.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                isNew={freshIds.has(a.id)}
                onNavigate={onClose}
                onDelete={() => remove.mutate(a.id)}
                deleting={remove.isPending && remove.variables === a.id}
                onRearm={() => rearm.mutate(a)}
                rearming={rearm.isPending && rearm.variables?.id === a.id}
              />
            ))}
          </AlertGroup>
        ) : null}
        {active.length > 0 ? (
          <AlertGroup label="Active" labelId={`${uid}-active`}>
            {active.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                isNew={false}
                onNavigate={onClose}
                onDelete={() => remove.mutate(a.id)}
                deleting={remove.isPending && remove.variables === a.id}
              />
            ))}
          </AlertGroup>
        ) : null}
      </>
    );
  }

  const actionError = remove.isError
    ? "The alert couldn't be deleted. Try again."
    : rearm.isError
      ? alertErrorMessage(rearm.error)
      : null;

  const sheet = (
    <dialog ref={dialogRef} className="sheet" aria-labelledby={titleId} onClose={onClose}>
      <SheetHeader title="Price alerts" titleId={titleId} onClose={onClose} />
      {/* minmax(0, 1fr): a long row title must wrap, never widen the sheet */}
      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, marginTop: 8 }}
      >
        {body}
        {actionError ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {actionError}
          </p>
        ) : null}
        <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
          In-app only. Alerts are checked during market hours on fresh prices, and each one alerts
          once.
        </p>
      </div>
    </dialog>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}

function AlertGroup({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={labelId}>
      <h3 id={labelId} className="ar-group-label" style={{ margin: 0 }}>
        {label}
      </h3>
      <ul className="ar-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {children}
      </ul>
    </section>
  );
}

function AlertRow({
  alert,
  isNew,
  onNavigate,
  onDelete,
  deleting,
  onRearm,
  rearming = false,
}: {
  alert: PriceAlertDto;
  isNew: boolean;
  onNavigate: () => void;
  onDelete: () => void;
  deleting: boolean;
  onRearm?: () => void;
  rearming?: boolean;
}) {
  const title = alertTitle(alert);
  const isTriggered = alert.state === "TRIGGERED";
  const at = alert.triggerQuoteAt ?? alert.triggeredAt;
  const sub =
    isTriggered && alert.triggerPrice && at
      ? `${formatAlertPrice(alert.triggerPrice)} · ${formatAlertTime(at)}`
      : `Set ${formatDate(alert.createdAt)}`;
  return (
    <li className="ar-row">
      <span
        className={`ar-chipicon ar-chipicon--sm ar-chipicon--${isTriggered ? "info" : "neutral"}`}
        aria-hidden
      >
        <Icon name="bell" size={18} />
      </span>
      <div className="ar-row__main">
        <span className="ar-row__title" style={{ whiteSpace: "normal" }}>
          <Link href={`/i/${encodeURIComponent(alert.symbol)}`} onClick={onNavigate}>
            {title}
          </Link>
        </span>
        <span className="ar-row__sub tabular" style={{ whiteSpace: "normal" }}>
          {sub}
          {isNew ? (
            <>
              {" "}
              <span className="ar-tag ar-tag--neutral">New</span>
            </>
          ) : null}
        </span>
      </div>
      <div
        className="ar-row__end"
        style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        {onRearm ? (
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--compact"
            aria-label={`Re-arm alert: ${title.replace(" crossed ", " ")}`}
            disabled={rearming}
            aria-busy={rearming || undefined}
            onClick={onRearm}
          >
            Re-arm
          </button>
        ) : null}
        <button
          type="button"
          className="ar-btn ar-btn--icon ar-btn--plain"
          aria-label={`Delete alert: ${title}`}
          disabled={deleting}
          aria-busy={deleting || undefined}
          onClick={onDelete}
        >
          <Icon name="x" size={20} />
        </button>
      </div>
    </li>
  );
}
