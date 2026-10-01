/**
 * SEC conformed names read like filings ("ELI LILLY & Co", "WATERS CORP
 * /DE/", "SCHWAB CHARLES CORP"). Lists show a cleaned form: jurisdiction tags
 * and share-class suffixes dropped, shouting words title-cased, short
 * acronyms (IBM, AT&T, RTX) kept. Display only.
 */
const KEEP_UPPER = new Set([
  "AT&T",
  "IBM",
  "RTX",
  "UPS",
  "CVS",
  "BNY",
  "HCA",
  "AMD",
  "PNC",
  "CSX",
  "KLA",
  "TJX",
  "GE",
  "NXP",
  "ARM",
  "LLC",
  "LP",
  "II",
  "III",
  "US",
  "USA",
  "NV",
  "SE",
  "AG",
  "SA",
  "AB",
  "NA",
]);

export function displayCompanyName(raw: string): string {
  let name = raw
    .replace(/\s*\/[A-Z]{2,3}\/?\s*$/g, "") // "/DE/", "/MN/", "/NY"
    .replace(/\s*\\new$/i, "")
    .replace(/\s+(Class [A-Z]\s+)?(Common Stock|Ordinary Shares|Common Shares)\s*$/i, "")
    .replace(/\s+Class [A-Z]$/i, "")
    .trim();
  // word by word: filings mix cases ("ELI LILLY & Co")
  name = name
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[.,]$/, "");
      if (KEEP_UPPER.has(bare) || bare !== bare.toUpperCase() || !/[A-Z]{2}/.test(bare)) return w;
      if (bare.length === 2 && !["CO", "OF", "IN"].includes(bare)) return w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
  return name.replace(/\b(Corp|Inc|Co|Ltd)\b(?!\.)/g, "$1.").replace(/\.\./g, ".");
}
