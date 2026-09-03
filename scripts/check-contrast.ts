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

function parseTheme(block: string): Map<string, Rgb> {
  const tokens = new Map<string, Rgb>();
  const re = /--([a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/g;
  for (const match of block.matchAll(re)) {
    const [, name, l, c, h] = match;
    tokens.set(name!, oklchToSrgb(Number(l), Number(c), Number(h)));
  }
  return tokens;
}

// TEXTUAL CONTRACT (mirrored in the tokens.css header): the file is sliced by
// selector text — :root light block, then [data-theme="dark"], then the
// @media duplicate, then the [data-mode="live"] overlays. Only bare oklch()
// literals are visible to this gate.
const css = readFileSync("src/styles/tokens.css", "utf8");
const darkStart = css.indexOf('[data-theme="dark"]');
const light = parseTheme(css.slice(0, darkStart));
const darkEnd = css.indexOf("@media", darkStart);
const dark = parseTheme(css.slice(darkStart, darkEnd === -1 ? undefined : darkEnd));
// Live-mode overlays compose onto each base theme (the hero deepens; the
// on-hero pairs must still clear their minimums on the deeper card).
const liveStart = css.indexOf('[data-mode="live"]');
const liveDarkStart = css.indexOf('[data-theme="dark"][data-mode="live"]');
const liveLight = new Map([...light, ...parseTheme(css.slice(liveStart, liveDarkStart))]);
const liveDark = new Map([...dark, ...parseTheme(css.slice(liveDarkStart))]);

// The load-bearing pairs: [foreground, background, minimum ratio].
const CHECKS: Array<[string, string, number]> = [
  ["ink", "bg", 7], // body text target (AAA-ish per palette guidance)
  ["ink", "surface", 7],
  ["ink-muted", "bg", 4.5], // secondary text is still body text
  ["ink-muted", "surface", 4.5],
  ["accent", "bg", 4.5], // links/status text on page background
  ["on-accent", "accent", 4.5], // button labels
  ["gain", "bg", 3], // large/emphasized financial figures + badges
  ["loss", "bg", 4.5], // loss doubles as error text
  ["warning", "bg", 3],
  // the colour-block quartet: labels on the solid pop colours
  ["on-pop-coral", "pop-coral", 4.5],
  ["on-pop-teal", "pop-teal", 4.5],
  ["on-pop-amber", "pop-amber", 4.5],
  ["on-pop-blue", "pop-blue", 4.5],
  // glass chrome: text is verified against the solid fallback plate (the
  // worst case — alpha glass over content is not parser-checkable)
  ["ink", "glass-bg-solid", 4.5],
  ["ink-muted", "glass-bg-solid", 4.5],
];
// The wallet-card hero is a dark surface in BOTH themes AND both modes.
const HERO_CHECKS: Array<[string, string, number]> = [
  ["on-hero", "hero", 7],
  ["hero-muted", "hero", 4.5],
  ["gain-on-hero", "hero", 3],
  ["loss-on-hero", "hero", 4.5],
  ["chart-line-on-hero", "hero", 3],
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
