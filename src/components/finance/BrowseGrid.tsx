"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type BrowseIcon } from "@/lib/api";
import { Icon, type IconName } from "@/components/icons/Icon";
import { SymbolLogo } from "./SymbolLogo";

/** The API's browse icon keys → the icon set's sector glyphs. */
const GLYPHS: Record<BrowseIcon, IconName> = {
  trophy: "trophy",
  cpu: "technology",
  "radio-tower": "communication",
  "shopping-bag": "consumer-discretionary",
  "shopping-cart": "consumer-staples",
  "heart-pulse": "health-care",
  landmark: "financials",
  factory: "industrials",
  fuel: "energy",
  pickaxe: "materials",
  building: "real-estate",
  zap: "utilities",
};

/**
 * A browse category's chip. Every list holds stocks, so every chip is the
 * Stocks chip — bloom colour means asset class, never "which sector". The
 * icon is what tells them apart.
 */
export function BrowseChip({ icon, size = "sm" }: { icon: BrowseIcon; size?: "sm" | "md" }) {
  return (
    <span className={`ar-chipicon ar-chipicon--stocks${size === "sm" ? " ar-chipicon--sm" : ""}`}>
      <Icon name={GLYPHS[icon]} />
    </span>
  );
}

/** A few company logos, overlapped — a peek at what's inside a list. */
export function LogoStack({ symbols }: { symbols: string[] }) {
  return (
    <span className="logo-stack" aria-hidden>
      {symbols.map((s) => (
        <SymbolLogo key={s} symbol={s} size={20} />
      ))}
    </span>
  );
}

export function formatAsOfDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/**
 * The Markets screen before a search: the Top 100 as one featured card, then
 * the sectors as account rows on one list card (the system's ListRow: chip,
 * name and count, a peek of logos, chevron) — not a grid of same-size cards.
 * Each link's text is its accessible name.
 */
export function BrowseGrid() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["browse"],
    queryFn: api.browse,
    staleTime: 60 * 60_000, // the ranking moves once a day
  });

  return (
    <section aria-labelledby="browse-heading" style={{ display: "grid", gap: 12 }}>
      <h2 id="browse-heading" className="ar-heading" style={{ margin: 0 }}>
        Browse
      </h2>
      {isError ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__text">
              Browsing is unavailable right now — you can still search above.
            </span>
          </div>
        </div>
      ) : isPending ? (
        <div aria-busy="true" style={{ display: "grid", gap: 12 }}>
          <span className="ar-skel" style={{ display: "block", height: 80, borderRadius: 20 }} />
          <div className="ar-card ar-card--list">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="ar-skel-row">
                <span className="ar-skel ar-skel--chip" />
                <div className="ar-skel-row__main">
                  <span className="ar-skel ar-skel--text" style={{ width: "45%" }} />
                  <span className="ar-skel ar-skel--text" style={{ width: "30%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Link href={`/markets/s/${data.top100.slug}`} className="ar-card browse-featured">
            <span className="browse-featured__lead">
              <BrowseChip icon="trophy" size="md" />
              <span className="browse-featured__text">
                <span className="browse-featured__name">Top 100</span>
                <span className="browse-featured__meta">
                  Largest US companies by market value · updated {formatAsOfDate(data.top100.asOf)}
                </span>
              </span>
            </span>
            <LogoStack symbols={data.top100.preview} />
          </Link>
          <div style={{ display: "grid", gap: 8 }}>
            <h3 className="ar-group-label" style={{ margin: 0 }}>
              Sectors
            </h3>
            <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
              {data.sectors.map((s) => (
                <li key={s.slug}>
                  <Link href={`/markets/s/${s.slug}`} className="ar-row">
                    <BrowseChip icon={s.icon} size="md" />
                    <span className="ar-row__main">
                      <span className="ar-row__title">{s.name}</span>
                      <span className="ar-row__sub">{s.count} companies</span>
                    </span>
                    <span className="ar-row__end browse-row__end">
                      <LogoStack symbols={s.preview} />
                      <Icon name="chevron-right" size={20} className="ar-row__chev" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
