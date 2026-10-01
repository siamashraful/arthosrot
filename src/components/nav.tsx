"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertsBell } from "@/components/finance/AlertsBell";
import { Icon, type IconName } from "@/components/icons/Icon";

/**
 * The five primary destinations in tab-bar order: Search is the centre,
 * emphasised item (the system's TabBar puts the trade entry point on a disc
 * in the middle of the bar). `sections` are the path prefixes a destination
 * owns (UX_PATTERNS.md → Information architecture): an instrument page is
 * part of Search, where it was found.
 */
const LINKS = [
  { href: "/", label: "Dashboard", icon: "home", centre: false, sections: [] },
  { href: "/portfolio", label: "Portfolio", icon: "pie", centre: false, sections: [] },
  { href: "/markets", label: "Search", icon: "search", centre: true, sections: ["/i"] },
  { href: "/orders", label: "Orders", icon: "orders", centre: false, sections: [] },
  { href: "/activity", label: "Activity", icon: "activity", centre: false, sections: [] },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: IconName;
  centre: boolean;
  sections: readonly string[];
}>;

function within(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isCurrent(pathname: string, href: string, sections: readonly string[] = []) {
  if (href === "/") return pathname === "/";
  return within(pathname, href) || sections.some((s) => within(pathname, s));
}

function links(pathname: string, emphasiseCentre: boolean) {
  return LINKS.map(({ href, label, icon, centre, sections }) => {
    const current = isCurrent(pathname, href, sections);
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
            <Icon name={icon} />
          </span>
        ) : (
          <Icon name={icon} />
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
      <Link href="/" className="shell-brand" aria-label="Arthosrot dashboard">
        <span className="brand-lockup" aria-hidden />
      </Link>
      {links(pathname, false)}
      <AlertsBell variant="sidebar" />
      <Link
        href="/settings"
        className="nav-link"
        aria-current={isCurrent(pathname, "/settings") ? "page" : undefined}
      >
        <Icon name="settings" />
        Settings
      </Link>
      <div className="shell-footer">
        Market data from IEX via Alpaca where configured. Simulated trading. See{" "}
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
        aria-label="Arthosrot dashboard"
      >
        <span className="brand-lockup" style={{ height: 26 }} aria-hidden />
      </Link>
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href="/markets"
          className="nav-link"
          aria-label="Search markets"
          aria-current={isCurrent(pathname, "/markets", ["/i"]) ? "page" : undefined}
        >
          <Icon name="search" />
        </Link>
        <AlertsBell />
        <Link
          href="/settings"
          className="nav-link"
          aria-label="Settings"
          aria-current={isCurrent(pathname, "/settings") ? "page" : undefined}
        >
          <Icon name="settings" />
        </Link>
      </div>
    </header>
  );
}
