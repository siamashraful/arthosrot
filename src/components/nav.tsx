"use client";

import { Activity, Home, LineChart, ListOrdered, PieChart, Search, Settings } from "lucide-react";
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
      <div className="shell-brand">Arthosrot</div>
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

/** < md: compact top app bar — brand, search shortcut, and Settings access
 *  (the sidebar is hidden on mobile; Settings must remain reachable). */
export function MobileTopBar() {
  const pathname = usePathname();
  return (
    <header className="mobile-top-bar">
      <Link href="/" className="shell-brand" style={{ margin: 0, padding: 0 }}>
        Arthosrot
      </Link>
      <div style={{ display: "flex", gap: "var(--space-1)" }}>
        <Link
          href="/markets"
          className="nav-link"
          aria-label="Search markets"
          aria-current={pathname.startsWith("/markets") ? "page" : undefined}
        >
          <Search aria-hidden />
        </Link>
        <Link
          href="/settings"
          className="nav-link"
          aria-label="Settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        >
          <Settings aria-hidden />
        </Link>
      </div>
    </header>
  );
}
