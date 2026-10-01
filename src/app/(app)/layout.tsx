import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomNav, MobileTopBar, SidebarNav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { StatusBanner } from "@/components/status-banner";
import { PATHNAME_HEADER, signInHref } from "@/lib/return-path";
import { getSession } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  // Signed out: to sign-in, carrying the page asked for (src/proxy.ts).
  if (!session) redirect(signInHref(requestHeaders.get(PATHNAME_HEADER)));

  return (
    <Providers>
      <MobileTopBar />
      <StatusBanner />
      <div className="shell">
        <SidebarNav />
        <main className="shell-main">{children}</main>
      </div>
      <BottomNav />
    </Providers>
  );
}
