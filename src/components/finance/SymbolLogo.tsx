"use client";

import { useState } from "react";

/**
 * A stock logo in the system's category-chip footprint: the 40px rounded
 * square (IconChip) when `size >= 28`, the 24px `xs` chip otherwise.
 *
 * - Logo loaded: the image IS the chip — it fills the whole square at the
 *   chip radius. Upstream logos are full-bleed square marks, so framing them
 *   inside a tinted chip read as a small box floating in a box.
 * - No logo (the route 404s: logo upstream unset, or the CDN has none for
 *   this symbol): the Stocks IconChip with the symbol's first character as a
 *   monogram, cobalt on sky — a designed state, not a broken image.
 *
 * Decorative throughout (aria-hidden): the symbol text beside it is the
 * accessible carrier.
 */
/**
 * What a loaded logo needs behind it. Most CDN marks are opaque squares, but
 * some are a light glyph on transparency (drawn for dark grounds) and vanish
 * on a white chip; a few are effectively empty. Sampled once on a 16px canvas
 * — the image is same-origin (proxied), so its pixels are readable.
 */
function backdropFor(img: HTMLImageElement): "surface" | "ink" | "empty" {
  try {
    const n = 16;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "surface";
    ctx.drawImage(img, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    let coverage = 0;
    let lumSum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3]! / 255;
      coverage += a;
      lumSum += a * ((0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255);
    }
    const pixels = n * n;
    if (coverage / pixels < 0.02) return "empty";
    // transparent enough to show the chip, and what IS drawn is light
    return coverage / pixels < 0.9 && lumSum / coverage > 0.8 ? "ink" : "surface";
  } catch {
    return "surface";
  }
}

export function SymbolLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [onInk, setOnInk] = useState(false);
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
    <img
      src={`/api/v1/logos/${encodeURIComponent(symbol)}`}
      alt=""
      aria-hidden
      loading="lazy"
      width={box}
      height={box}
      className="symbol-logo"
      style={{
        borderRadius: big ? "var(--radius-chip)" : 7,
        ...(onInk ? { background: "var(--ink)" } : {}),
      }}
      onLoad={(e) => {
        const backdrop = backdropFor(e.currentTarget);
        if (backdrop === "empty") setFailed(true);
        else setOnInk(backdrop === "ink");
      }}
      onError={() => setFailed(true)}
    />
  );
}
