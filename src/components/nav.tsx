"use client";

import { Activity, Home, LineChart, ListOrdered, PieChart, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/markets", label: "Markets", icon: LineChart },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/activity", label: "Activity", icon: Activity },
] as const;

function links(pathname: string) {
  return LINKS.map(({ href, label, icon: Icon }) => {
    const current =
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link key={href} href={href} className="nav-link" aria-current={current ? "page" : undefined}>
        <Icon aria-hidden />
        {label}
      </Link>
    );
  });
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label="Primary">
      <div className="shell-brand">Ledgerline</div>
      {links(pathname)}
      <Link
        href="/settings"
        className="nav-link"
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
      >
        <Settings aria-hidden />
        Settings
      </Link>
      <div className="shell-footer">
        Market data from IEX via Alpaca where configured. Simulated trading — see{" "}
        <Link href="/settings#data">data limitations</Link>.
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {links(pathname)}
    </nav>
  );
}
