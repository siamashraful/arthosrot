"use client";

import { Activity, Home, ListOrdered, PieChart, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The five primary destinations in tab-bar order: Markets is the centre,
 * emphasised item (the system's TabBar puts the trade entry point on a disc
 * in the middle of the bar).
 */
const LINKS = [
  { href: "/", label: "Dashboard", icon: Home, centre: false },
  { href: "/portfolio", label: "Portfolio", icon: PieChart, centre: false },
  { href: "/markets", label: "Markets", icon: Search, centre: true },
  { href: "/orders", label: "Orders", icon: ListOrdered, centre: false },
  { href: "/activity", label: "Activity", icon: Activity, centre: false },
] as const;

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function links(pathname: string, emphasiseCentre: boolean) {
  return LINKS.map(({ href, label, icon: Icon, centre }) => {
    const current = isCurrent(pathname, href);
    const emphasised = emphasiseCentre && centre;
    return (
      <Link
        key={href}
        href={href}
        className={emphasised ? "nav-link nav-link--centre" : "nav-link"}
        aria-current={current ? "page" : undefined}
      >
        {emphasised ? (
          <span className="nav-disc">
            <Icon aria-hidden />
          </span>
        ) : (
          <Icon aria-hidden />
        )}
        {label}
      </Link>
    );
  });
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label="Primary">
      <Link href="/" className="shell-brand" aria-label="Arthosrot — dashboard">
        <span className="brand-lockup" aria-hidden />
      </Link>
      {links(pathname, false)}
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
      {links(pathname, true)}
    </nav>
  );
}

/** < md: compact top app bar — brand, search shortcut, and Settings access
 *  (the sidebar is hidden on mobile; Settings must remain reachable). */
export function MobileTopBar() {
  const pathname = usePathname();
  return (
    <header className="mobile-top-bar">
      <Link
        href="/"
        className="shell-brand"
        style={{ margin: 0, padding: 0 }}
        aria-label="Arthosrot — dashboard"
      >
        <span className="brand-lockup" style={{ height: 26 }} aria-hidden />
      </Link>
      <div style={{ display: "flex", gap: 8 }}>
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
