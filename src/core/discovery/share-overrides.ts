import type { ShareOverride } from "./ranking";

/**
 * Filers the bulk SEC share data gets wrong — kept short, each with its
 * source. Review when the job logs an override older than ~200 days (a new
 * 10-Q cover page is out every quarter).
 */
export const SHARE_OVERRIDES: readonly ShareOverride[] = [
  {
    // Berkshire tags its cover page per class with custom elements, so the
    // bulk frames carry nothing current (last values are from 2011/2015).
    // Quoted as BRK.B, so count Class-B equivalents: A × 1,500 + B.
    cik: "1067983",
    name: "Berkshire Hathaway",
    displaySymbol: "BRK.B",
    shares: "2140710161", // 488,450 A × 1,500 + 1,408,035,161 B
    asOf: "2026-07-29",
    note: "10-Q cover page (period 2026-06-30), shares outstanding as of 2026-07-29",
  },
  {
    // Class A trades; B-1/B-2/B-3/C and the preferreds convert into it, so
    // value Visa on as-converted class A shares (Note 11 of the 10-Q).
    cik: "1403161",
    name: "Visa",
    displaySymbol: "V",
    shares: "1880000000", // 1,880M as-converted class A (rounded to millions)
    asOf: "2026-06-30",
    note: "10-Q (period 2026-06-30) Note 11, as-converted class A common stock total",
  },
  {
    // Missing from the bulk cover/weighted-average frames; single class.
    cik: "831001",
    name: "Citigroup",
    displaySymbol: "C",
    shares: "1677436783",
    asOf: "2026-06-30",
    note: "10-Q cover page: common stock outstanding on 2026-06-30",
  },
  {
    // An ADR whose catalog name carries no depositary marker: the filing
    // counts ordinary shares, the listing trades ADSs (1 ADS = 4 ordinary).
    cik: "835403",
    name: "Diageo",
    exclude: true,
    asOf: "2026-09-30",
    note: "ADR (1:4) — excluded like every depositary receipt",
  },
  {
    // Every share fact Repay files — weighted average AND public float — is
    // scaled 1,000× (≈83B shares), so the float cross-check can't catch it.
    cik: "1720592",
    name: "Repay Holdings",
    exclude: true,
    asOf: "2026-09-30",
    note: "XBRL share and float facts mis-scaled ×1,000 in every 10-Q/10-K checked",
  },
];
