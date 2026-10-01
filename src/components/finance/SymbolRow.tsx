import Link from "next/link";
import type { ReactNode } from "react";
import { SymbolLogo } from "./SymbolLogo";

/**
 * One instrument as the system's ListRow, linking to its instrument page:
 * optional lead (e.g. a rank), 40px logo chip, title + sub, an optional
 * aside between the text and the end (e.g. the watchlist's sparkline), and
 * an end slot for the price / value and its change. The row's text is the link's
 * accessible name, so the title should start with the symbol or company.
 * Render inside an `ar-list` <li>.
 */
export function SymbolRow({
  symbol,
  title,
  sub,
  end,
  lead,
  aside,
}: {
  symbol: string;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  lead?: ReactNode;
  /** Rendered as-is between the text and the end slot (decorative or data, e.g. a sparkline). */
  aside?: ReactNode;
}) {
  return (
    <Link href={`/i/${encodeURIComponent(symbol)}`} className="ar-row">
      {lead}
      <SymbolLogo symbol={symbol} size={40} />
      <span className="ar-row__main">
        <span className="ar-row__title">{title}</span>
        {sub !== undefined ? <span className="ar-row__sub">{sub}</span> : null}
      </span>
      {aside}
      {end !== undefined ? <span className="ar-row__end">{end}</span> : null}
    </Link>
  );
}
