"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/components/states";

/**
 * The body of an error boundary (src/app/error.tsx, src/app/(app)/error.tsx):
 * says plainly that the page failed — not that anything about the account
 * changed — and offers a retry that re-fetches the segment. The digest is
 * the server-log correlation id; the message itself is never shown (in
 * production it is generic anyway).
 *  - "shell": inside the app shell, the page title over an ErrorCard;
 *  - "standalone": outside it, the auth chrome's single centred card.
 */
export function RouteError({
  error,
  retry,
  variant,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  variant: "shell" | "standalone";
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const text = (
    <>
      This page couldn&apos;t be displayed. Try again. If it keeps failing, come back in a few
      minutes.
    </>
  );
  const reference = error.digest ? (
    <span className="ar-caption ar-tertiary" style={{ display: "block", marginTop: 8 }}>
      Reference {error.digest}
    </span>
  ) : null;

  if (variant === "standalone") {
    return (
      <div className="auth-shell">
        <main className="auth-card" role="alert">
          <h1 className="ar-title">Something went wrong</h1>
          <p className="ar-body ar-secondary">
            {text}
            {reference}
          </p>
          <button type="button" className="ar-btn ar-btn--primary ar-btn--block" onClick={retry}>
            Try again
          </button>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Something went wrong</h1>
      </div>
      <ErrorCard
        message={
          <>
            {text}
            {reference}
          </>
        }
        onRetry={retry}
      />
    </div>
  );
}
