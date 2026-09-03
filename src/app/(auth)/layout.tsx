import Link from "next/link";
import type { ReactNode } from "react";

/** Auth chrome: the stacked lockup above the card — the one place the brand
 *  introduces itself at full size. The Bengali line is outlined vector
 *  inside the SVG (BRAND.md §7). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <Link href="/" aria-label="Arthosrot">
        <span className="brand-lockup auth-brand" aria-hidden />
      </Link>
      {children}
    </div>
  );
}
