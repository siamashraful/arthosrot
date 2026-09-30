import { readFileSync } from "node:fs";

/**
 * WCAG contrast gate over the design tokens (docs/design/ACCESSIBILITY.md):
 * verified by computation in CI, not by eyeballing. Parses the oklch() tokens
 * in src/styles/tokens.css for both themes and checks the load-bearing pairs.
 */

type Rgb = [number, number, number];

function oklchToSrgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  // OKLab -> LMS (cube roots)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  // LMS -> linear sRGB
  const lin: Rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((v) => Math.min(1, Math.max(0, v))) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; // inputs already linear
}

function contrast(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function hexToSrgb(hex: string): Rgb {
  const h = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, (c) => c + c) : hex;
  const n = parseInt(h.slice(1, 7), 16);
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}

/** Bare hex (the design system's native form) and oklch() literals both parse; rgba() and var() are ignored. */
function parseTheme(block: string): Map<string, Rgb> {
  const tokens = new Map<string, Rgb>();
  const hexRe = /--([a-z0-9-]+):\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\s*;/gi;
  for (const match of block.matchAll(hexRe)) tokens.set(match[1]!, hexToSrgb(match[2]!));
  const okRe = /--([a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/g;
  for (const match of block.matchAll(okRe)) {
    const [, name, l, c, h] = match;
    tokens.set(name!, oklchToSrgb(Number(l), Number(c), Number(h)));
  }
  return tokens;
}

// TEXTUAL CONTRACT (mirrored in the tokens.css header): the file is sliced by
// selector text — :root light block, then [data-theme="dark"], then the
// @media duplicate, then the [data-mode="live"] overlays.
const css = readFileSync("src/styles/tokens.css", "utf8");
const darkStart = css.indexOf('[data-theme="dark"]');
const light = parseTheme(css.slice(0, darkStart));
const darkEnd = css.indexOf("@media", darkStart);
const dark = parseTheme(css.slice(darkStart, darkEnd === -1 ? undefined : darkEnd));
const liveStart = css.indexOf('[data-mode="live"]');
const liveDarkStart = css.indexOf('[data-theme="dark"][data-mode="live"]');
const liveLight = new Map([...light, ...parseTheme(css.slice(liveStart, liveDarkStart))]);
const liveDark = new Map([...dark, ...parseTheme(css.slice(liveDarkStart))]);

// The load-bearing pairs — the design system's own usage notes, verified by
// computation: [foreground, background, minimum ratio].
const CHECKS: Array<[string, string, number]> = [
  ["text", "bg", 7],
  ["text", "surface", 7],
  ["text", "raised", 7],
  ["text-secondary", "surface", 4.5],
  ["text-secondary", "bg", 4.5],
  ["text-tertiary", "surface", 4.5], // captions, timestamps
  ["text-tertiary", "bg", 4.5], // the system's slate reads 4.43 here; the app deepens it one step (tokens.css)
  ["on-primary", "primary", 4.5], // button labels
  // semantic text variants (the full hues are for arrows, icons, large numerals)
  ["gain-text", "surface", 4.5],
  ["loss-text", "surface", 4.5],
  ["gain-text", "gain-tint", 4.5],
  ["loss-text", "loss-tint", 4.5],
  ["warning-text", "surface", 4.5],
  ["warning-text", "warning-tint", 4.5],
  ["info-text", "surface", 4.5],
  ["info-text", "info-tint", 4.5],
  ["gain", "surface", 3], // large numerals + icons only
  ["loss", "surface", 3],
  ["lime-text", "surface", 4.5],
  // tint chips: text is on-tint, the icon is the hue (3:1 floor)
  ["on-tint", "sky", 4.5],
  ["on-tint", "lavender", 4.5],
  ["on-tint", "peach", 4.5],
  ["on-tint", "rose", 4.5],
  ["on-tint", "butter", 4.5],
  ["cobalt", "sky", 3],
  ["violet", "lavender", 3],
  ["tangerine-deep", "peach", 3],
  ["blush-deep", "rose", 3],
  ["mustard-deep", "butter", 3],
  // saturated tiles the app actually uses (white on mustard is a documented
  // exception the app avoids — cash renders on the butter tint instead)
  ["on-bloom", "cobalt", 3],
  ["on-bloom", "violet", 3],
];
// The hero card: ink in light, surface-dark in dark, black in live — every mode.
const HERO_CHECKS: Array<[string, string, number]> = [
  ["on-hero", "hero", 7],
  ["on-hero-secondary", "hero", 4.5],
  ["hero-gain", "hero", 3],
  ["hero-loss", "hero", 3],
];

let failed = false;
let count = 0;
const run = (themeName: string, tokens: Map<string, Rgb>, checks: typeof CHECKS) => {
  for (const [fgName, bgName, min] of checks) {
    count += 1;
    const fg = tokens.get(fgName);
    const bg = tokens.get(bgName);
    if (!fg || !bg) {
      console.error(`[${themeName}] missing token: ${fgName} or ${bgName}`);
      failed = true;
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= min;
    if (!ok) failed = true;
    console.log(
      `[${themeName}] ${fgName} on ${bgName}: ${ratio.toFixed(2)} (min ${min}) ${ok ? "ok" : "FAIL"}`,
    );
  }
};
run("light", light, [...CHECKS, ...HERO_CHECKS]);
run("dark", dark, [...CHECKS, ...HERO_CHECKS]);
run("light+live", liveLight, HERO_CHECKS);
run("dark+live", liveDark, HERO_CHECKS);

if (failed) {
  console.error("\nContrast check FAILED — adjust token values (semantics stay).");
  process.exit(1);
}
console.log(`\nAll ${count} token contrast checks passed.`);
