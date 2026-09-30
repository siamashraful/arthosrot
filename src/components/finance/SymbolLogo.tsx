"use client";

import { useState } from "react";

/**
 * A stock logo in the system's category chip: the 40px rounded-square
 * IconChip (sky tint, the Stocks category) when `size >= 28`, the 24px `xs`
 * chip otherwise. When the logo route 404s (deterministic/dev has no broker
 * key; some symbols simply have no logo) the chip shows the symbol's first
 * character as a monogram in cobalt on sky — the only state offline dev ever
 * sees, so it has to look intentional, not broken. Decorative throughout
 * (aria-hidden): the symbol text beside the chip is the accessible carrier.
 */
export function SymbolLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const big = size >= 28;
  const box = big ? 40 : 24;
  const cls = `ar-chipicon ar-chipicon--stocks${big ? "" : " ar-chipicon--xs"}`;

  if (failed) {
    return (
      <span
        aria-hidden
        className={cls}
        style={{ fontSize: big ? 16 : 11, fontWeight: 700, lineHeight: 1, userSelect: "none" }}
      >
        {symbol.charAt(0)}
      </span>
    );
  }

  // Plain <img>, deliberately: same-origin proxied asset — next/image would
  // add an optimizer round-trip for a tile this small.
  return (
    <span aria-hidden className={cls}>
      <img
        src={`/api/v1/logos/${encodeURIComponent(symbol)}`}
        alt=""
        loading="lazy"
        width={box - (big ? 12 : 6)}
        height={box - (big ? 12 : 6)}
        style={{ objectFit: "contain", borderRadius: big ? 6 : 4 }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
