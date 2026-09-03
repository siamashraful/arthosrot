"use client";

import { useState } from "react";

/**
 * A stock logo tile with a deliberate fallback: when the logo route 404s
 * (deterministic/dev has no broker key; some symbols simply have no logo)
 * the tile renders the symbol's first character as a quiet monogram — the
 * only state offline dev ever sees, so it has to look intentional, not
 * broken. Decorative throughout (aria-hidden): the symbol text beside the
 * tile is the accessible carrier.
 */
export function SymbolLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size,
    height: size,
    borderRadius: "var(--radius-sm)",
    flexShrink: 0,
  } as const;

  if (failed) {
    return (
      <span
        aria-hidden
        style={{
          ...box,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2)",
          color: "var(--ink-muted)",
          fontSize: size * 0.55,
          fontWeight: 600,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {symbol.charAt(0)}
      </span>
    );
  }

  // Plain <img>, deliberately: same-origin proxied asset — next/image would
  // add an optimizer round-trip for a 20px tile.
  return (
    <img
      src={`/api/v1/logos/${encodeURIComponent(symbol)}`}
      alt=""
      aria-hidden
      loading="lazy"
      width={size}
      height={size}
      style={{ ...box, objectFit: "contain", background: "var(--surface-2)" }}
      onError={() => setFailed(true)}
    />
  );
}
