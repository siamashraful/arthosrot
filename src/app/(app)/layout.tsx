import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomNav, MobileTopBar, SidebarNav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { StatusBanner } from "@/components/status-banner";
import { getSession } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

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
