import { closeDb, getDb, schema } from "../src/infra/db";
import { DEFAULT_FIXTURES } from "../src/infra/market-data";

/**
 * Idempotent reference-data seed: liquid US symbols so search works out of the
 * box. Instruments only — users sign up through the app (test users are a
 * test-harness concern, never seeded into production data).
 */

const EXTRA: Array<{ symbol: string; name: string; exchange: string }> = [
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc. Class B", exchange: "NYSE" },
  { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE" },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE" },
  { symbol: "PG", name: "Procter & Gamble Co.", exchange: "NYSE" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE" },
  { symbol: "UNH", name: "UnitedHealth Group Inc.", exchange: "NYSE" },
  { symbol: "HD", name: "The Home Depot Inc.", exchange: "NYSE" },
  { symbol: "MA", name: "Mastercard Incorporated", exchange: "NYSE" },
  { symbol: "BAC", name: "Bank of America Corp.", exchange: "NYSE" },
  { symbol: "DIS", name: "The Walt Disney Company", exchange: "NYSE" },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", exchange: "NASDAQ" },
  { symbol: "INTC", name: "Intel Corporation", exchange: "NASDAQ" },
  { symbol: "CSCO", name: "Cisco Systems Inc.", exchange: "NASDAQ" },
  { symbol: "PEP", name: "PepsiCo Inc.", exchange: "NASDAQ" },
  { symbol: "COST", name: "Costco Wholesale Corporation", exchange: "NASDAQ" },
  { symbol: "ADBE", name: "Adobe Inc.", exchange: "NASDAQ" },
  { symbol: "CRM", name: "Salesforce Inc.", exchange: "NYSE" },
  { symbol: "ORCL", name: "Oracle Corporation", exchange: "NYSE" },
  { symbol: "T", name: "AT&T Inc.", exchange: "NYSE" },
];

/**
 * Offline key-stats fundamentals for the ten core fixtures (real CIKs, shares
 * and EPS of roughly the right size — fixture data, never refreshed). In a
 * deployment these rows come from the daily SEC job instead.
 */
const FIXTURE_FUNDAMENTALS: Array<[symbol: string, cik: string, shares: string, epsTtm: string]> = [
  ["AAPL", "320193", "14594180000", "7.9000"],
  ["MSFT", "789019", "7425545491", "15.2000"],
  ["GOOGL", "1652044", "12151000000", "11.5000"],
  ["AMZN", "1018724", "10700000000", "7.1000"],
  ["NVDA", "1045810", "24300000000", "7.9100"],
  ["META", "1326801", "2520000000", "27.5000"],
  ["TSLA", "1318605", "3220000000", "-0.4000"], // a loss year: P/E "n/m"
  ["JPM", "19617", "2750000000", "21.0000"],
  ["V", "1403161", "1880000000", "11.4000"],
  ["KO", "21344", "4300000000", "2.8500"],
];

async function main(): Promise<void> {
  const db = getDb();
  const all = [
    ...DEFAULT_FIXTURES.map(({ symbol, name, exchange }) => ({ symbol, name, exchange })),
    ...EXTRA,
  ];
  for (const inst of all) {
    await db
      .insert(schema.instruments)
      .values(inst)
      .onConflictDoUpdate({
        target: schema.instruments.symbol,
        // status: seeded liquid names are always tradable — re-seeding is
        // also the recovery path for a DB poisoned by a bad sync (INACTIVE
        // must never be a one-way trap).
        set: { name: inst.name, exchange: inst.exchange, status: "ACTIVE" },
      });
  }
  console.log(`seeded ${all.length} instruments`);

  for (const [symbol, cik, shares, epsTtm] of FIXTURE_FUNDAMENTALS) {
    const fixture = DEFAULT_FIXTURES.find((f) => f.symbol === symbol)!;
    const row = {
      symbol,
      cik,
      name: fixture.name,
      shares: BigInt(shares),
      sharesAsOf: "2026-07-17",
      sharesBasis: "fixture",
      epsTtm,
      epsBasis: "ttm",
      epsPeriodEnd: "2026-06-30",
      epsCheckedAt: new Date(),
    };
    await db
      .insert(schema.companyFundamentals)
      .values(row)
      .onConflictDoUpdate({ target: schema.companyFundamentals.symbol, set: row });
  }
  console.log(`seeded ${FIXTURE_FUNDAMENTALS.length} fixture fundamentals`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
