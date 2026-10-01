import type { CSSProperties } from "react";

/**
 * The Arthosrot icon set — the ONE icon library in the app (docs/design/DESIGN.md
 * Iconography). 24px grid, 1.75px stroke (`--icon-stroke`), rounded caps and
 * joins, drawn in currentColor.
 *
 * SYSTEM glyphs are copied verbatim from the Claude Design system's
 * `Arthosrot.icon` set (components/bundle.js) — never redraw one of these.
 * APP EXTENSIONS are glyphs the system doesn't provide, drawn in the same idiom
 * (simple strokes on the 24 grid, no fills, no detail below 1.75px). Use a
 * system glyph whenever one exists; add an extension only when none does.
 */
const SYSTEM = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  invest: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-6"/>',
  trade:
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  spend: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  "arrow-down-left": '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  "arrow-up": '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "chevron-left": '<path d="m15 6-6 6 6 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  "trending-up": '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  stocks: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  etf: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  options:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  crypto:
    '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M9.5 8h3.5a2 2 0 0 1 0 4H9.5m0 0h4a2 2 0 0 1 0 4H9.5M9.5 8v8"/>',
  cash: '<path d="M3 7a2 2 0 0 1 2-2h14v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2"/><path d="M16 14h.01"/>',
  banknote:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  dividend:
    '<circle cx="9" cy="9" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18"/><path d="M7 6h1v4"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  news: '<path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z"/><path d="M19 19a2 2 0 0 0 2-2v-8h-2"/><path d="M8 9h5M8 13h6M8 17h4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  pie: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  percent:
    '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  star: '<path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  transfer:
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  backspace:
    '<path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m18 9-6 6M12 9l6 6"/>',
  "eye-off":
    '<path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6"/><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/>',
  hand: '<path d="M12 3v10M6 5v8M18 5v8"/><path d="M4 21h16"/>',
} as const;

/** App extensions — same idiom, for concepts the system set doesn't cover. */
const EXTENSIONS = {
  // navigation
  orders: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6h2M4 12h2M4 18h2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  // direction counterpart of the system's trending-up
  "trending-down": '<path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/>',
  // theme toggle and account
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  // Markets browse
  trophy:
    '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
  technology:
    '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  communication:
    '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  "consumer-discretionary": '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  "consumer-staples":
    '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 11.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  "health-care":
    '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/><path d="M12 9v6M9 12h6"/>',
  financials: '<path d="m2 9 10-6 10 6z"/><path d="M5 21v-9M10 21v-9M14 21v-9M19 21v-9M3 21h18"/>',
  industrials:
    '<path d="M2 21h20"/><path d="M3 21V10l6 4v-4l6 4V5h6v16"/><path d="M7 17h.01M12 17h.01M17 17h.01"/>',
  energy:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  materials: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  "real-estate":
    '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/><path d="M10 21v-3h4v3"/>',
  utilities: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
} as const;

const ICONS: Record<string, string> = { ...SYSTEM, ...EXTENSIONS };

export type IconName = keyof typeof SYSTEM | keyof typeof EXTENSIONS;

/**
 * One glyph from the set. Decorative by default (aria-hidden): the visible
 * label beside it carries the meaning. Size defaults to the system's 24px; the
 * stroke follows `--icon-stroke` unless a small typographic glyph (delta
 * arrows) asks for the system's heavier 2.25.
 */
export function Icon({
  name,
  size = 24,
  stroke,
  className,
  style,
  filled = false,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  /** Fill the glyph (the watchlist star when on). */
  filled?: boolean;
}) {
  return (
    <svg
      className={`ar-icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICONS[name]! }}
    />
  );
}
