import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found | Arthosrot" };

/**
 * Any unmatched URL. It renders in the root layout (mode ribbon, no app
 * shell — the visitor may be signed out), so it borrows the auth chrome:
 * the lockup over one centred card with a single way back.
 */
export default function NotFound() {
  return (
    <div className="auth-shell">
      <Link href="/" aria-label="Arthosrot dashboard">
        <span className="brand-lockup auth-brand" aria-hidden />
      </Link>
      <main className="auth-card">
        <h1 className="ar-title">Page not found</h1>
        <p className="ar-body ar-secondary">
          This address doesn&apos;t match anything in Arthosrot. It may have moved, or the link may
          be incomplete.
        </p>
        <Link href="/" className="ar-btn ar-btn--primary ar-btn--block">
          Go to dashboard
        </Link>
      </main>
    </div>
  );
}
