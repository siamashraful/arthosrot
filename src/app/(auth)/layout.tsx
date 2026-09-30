import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/server/session";

/** Auth chrome: the stacked lockup above the card — the one place the brand
 *  introduces itself at full size. The Bengali line is outlined vector
 *  inside the SVG (BRAND.md §4). A signed-in visitor has nothing to do here
 *  and goes straight to the dashboard (the mirror of the app layout's
 *  signed-out redirect). */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession(await headers());
  if (session) redirect("/");

  return (
    <div className="auth-shell">
      <Link href="/" aria-label="Arthosrot">
        <span className="brand-lockup auth-brand" aria-hidden />
      </Link>
      {children}
    </div>
  );
}
