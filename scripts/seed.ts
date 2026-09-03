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
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
