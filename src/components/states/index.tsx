import type { ReactNode } from "react";

/**
 * The app's shared screen states, in the system's EmptyState / Skeleton
 * language (`ar-empty`, `ar-skel-row` on a content card). Every list, card
 * and page uses these instead of hand-rolled markup, so a loading, empty or
 * error state looks and behaves the same everywhere.
 */

/** A list-shaped loading placeholder: chip, two text lines, an end value. */
export function SkeletonRows({ count = 3, end = true }: { count?: number; end?: boolean }) {
  return (
    <div className="ar-card ar-card--list" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ar-skel-row">
          <span className="ar-skel ar-skel--chip" />
          <div className="ar-skel-row__main">
            <span className="ar-skel ar-skel--text" style={{ width: "50%" }} />
            <span className="ar-skel ar-skel--text" style={{ width: "30%" }} />
          </div>
          {end ? (
            <div className="ar-skel-row__end">
              <span className="ar-skel ar-skel--text" style={{ width: 72 }} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Nothing here yet — an invitation, not an apology (one optional action). */
export function EmptyCard({
  title,
  message,
  action,
}: {
  title?: string;
  message: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ar-card">
      <div className="ar-empty">
        {title ? <span className="ar-empty__title">{title}</span> : null}
        <span className="ar-empty__text">{message}</span>
        {action}
      </div>
    </div>
  );
}

/**
 * Something failed to load. Always says what failed and offers a retry when
 * the caller can retry (pass the query's refetch). role=alert so it's heard.
 */
export function ErrorCard({
  message,
  onRetry,
  retrying = false,
}: {
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="ar-card" role="alert">
      <div className="ar-empty">
        <span className="ar-empty__text">{message}</span>
        {onRetry ? (
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--compact"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The query-state rule every screen follows (TanStack keeps `data` when a
 * background refetch fails): show the error state only when there is no
 * data to show; a failed refetch over good data keeps the data on screen.
 */
export function showError(q: { isError: boolean; data: unknown }): boolean {
  return q.isError && q.data === undefined;
}
