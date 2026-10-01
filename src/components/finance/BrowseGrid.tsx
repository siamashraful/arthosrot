"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Cpu,
  Factory,
  Fuel,
  HeartPulse,
  Landmark,
  Pickaxe,
  RadioTower,
  ShoppingBag,
  ShoppingCart,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { api, type BrowseIcon } from "@/lib/api";
import { SymbolLogo } from "./SymbolLogo";

const ICONS: Record<BrowseIcon, LucideIcon> = {
  trophy: Trophy,
  cpu: Cpu,
  "radio-tower": RadioTower,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  "heart-pulse": HeartPulse,
  landmark: Landmark,
  factory: Factory,
  fuel: Fuel,
  pickaxe: Pickaxe,
  building: Building2,
  zap: Zap,
};

/**
 * A browse category's chip. Every list holds stocks, so every chip is the
 * Stocks chip — bloom colour means asset class, never "which sector". The
 * icon is what tells them apart.
 */
export function BrowseChip({ icon, size = "sm" }: { icon: BrowseIcon; size?: "sm" | "md" }) {
  const Icon = ICONS[icon];
  return (
    <span className={`ar-chipicon ar-chipicon--stocks${size === "sm" ? " ar-chipicon--sm" : ""}`}>
      <Icon aria-hidden />
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
 * The Markets screen before a search: the Top 100 first (full width), then
 * the sectors. Each card is one link whose text is its accessible name.
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
        <ul className="browse-grid" aria-busy="true">
          <li className="browse-grid__featured">
            <span className="ar-skel" style={{ display: "block", height: 112, borderRadius: 20 }} />
          </li>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <span
                className="ar-skel"
                style={{ display: "block", height: 132, borderRadius: 20 }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="browse-grid">
          <li className="browse-grid__featured">
            <Link
              href={`/markets/s/${data.top100.slug}`}
              className="ar-card browse-card browse-card--featured"
            >
              <span className="browse-card__lead">
                <BrowseChip icon="trophy" size="md" />
                <span className="browse-card__text">
                  <span className="browse-card__name">Top 100</span>
                  <span className="browse-card__meta">
                    Largest US companies by market value · updated{" "}
                    {formatAsOfDate(data.top100.asOf)}
                  </span>
                </span>
              </span>
              <LogoStack symbols={data.top100.preview} />
            </Link>
          </li>
          {data.sectors.map((s) => (
            <li key={s.slug}>
              <Link href={`/markets/s/${s.slug}`} className="ar-card browse-card">
                <BrowseChip icon={s.icon} />
                <span className="browse-card__text">
                  <span className="browse-card__name">{s.name}</span>
                  <span className="browse-card__meta">{s.count} companies</span>
                </span>
                <LogoStack symbols={s.preview} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
