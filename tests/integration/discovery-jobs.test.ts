import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ShareCount, SharesOutstandingSource } from "@/core/discovery";
import type { Quote } from "@/core/market-data";
import { Px, Qty } from "@/core/money";
import { closeDb, getDb, schema } from "@/infra/db";
import { marketCapRankings } from "@/infra/db/repositories/market-cap-rankings";
import { getBrowse, getBrowseList } from "@/server/api/discovery";
import { defineJob, runDueJobs } from "@/worker/jobs/registry";
import { refreshTop100 } from "@/worker/jobs/top100";
import { truncateAll } from "./helpers";

/**
 * Scheduled jobs + the Top 100 pipeline against a real Postgres: the job
 * registry's due/lease/retry rules, the ranking store, the job end to end
 * (stubbed SEC + prices), and the browse API's snapshot-or-seed choice.
 */

const HOUR = 3_600_000;

beforeEach(truncateAll);
afterAll(closeDb);

describe("job registry", () => {
  it("runs a job when due, then not again until its interval passes", async () => {
    let runs = 0;
    const job = defineJob({ name: "j", intervalMs: 24 * HOUR, run: async () => ++runs });
    let now = new Date("2026-09-30T00:00:00Z");
    const tick = () => runDueJobs([job], { now: () => now });

    expect((await tick())[0]!.status).toBe("ran");
    now = new Date(now.getTime() + 23 * HOUR);
    expect((await tick())[0]!.status).toBe("not-due");
    now = new Date(now.getTime() + 1 * HOUR);
    expect((await tick())[0]!.status).toBe("ran");
    expect(runs).toBe(2);
  });

  it("records a failure and retries on the next tick", async () => {
    let fail = true;
    const job = defineJob({
      name: "flaky",
      intervalMs: 24 * HOUR,
      run: async () => {
        if (fail) throw new Error("SEC said no");
        return "ok";
      },
    });
    const now = () => new Date("2026-09-30T00:00:00Z");
    expect(await runDueJobs([job], { now })).toEqual([
      { name: "flaky", status: "failed", error: "SEC said no" },
    ]);
    const [row] = await getDb()
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.name, "flaky"));
    expect(row).toMatchObject({
      lastError: "SEC said no",
      lastSucceededAt: null,
      leaseUntil: null,
    });

    fail = false;
    expect((await runDueJobs([job], { now }))[0]!.status).toBe("ran");
  });

  it("never runs one job twice at once (lease)", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = defineJob({
      name: "slow",
      intervalMs: HOUR,
      run: async () => {
        runs++;
        await gate;
      },
    });
    const first = runDueJobs([job]);
    await new Promise((r) => setTimeout(r, 50)); // first has claimed the lease
    const second = await runDueJobs([job]);
    release();
    expect((await first)[0]!.status).toBe("ran");
    expect(second[0]!.status).toBe("not-due");
    expect(runs).toBe(1);
  });

  it("skips disabled jobs without touching their record", async () => {
    const job = defineJob({
      name: "off",
      intervalMs: HOUR,
      enabled: () => false,
      run: async () => 1,
    });
    expect((await runDueJobs([job]))[0]!.status).toBe("disabled");
    expect(await getDb().select().from(schema.jobRuns)).toHaveLength(0);
  });
});

/** 120 synthetic filers: CIK n has n×1000 shares at $10 (bigger n = bigger). */
function syntheticMarket(offset = 0) {
  const counts: ShareCount[] = Array.from({ length: 120 }, (_, i) => ({
    cik: String(i + 1 + offset),
    name: `COMPANY ${i + 1 + offset} INC`,
    tickers: [`C${i + 1 + offset}`],
    shares: Qty.of((i + 1) * 1000),
    asOf: "2026-06-30",
    basis: "cover" as const,
    publicFloat: null,
  }));
  const shares: SharesOutstandingSource = {
    listShareCounts: async () => counts,
    industryCode: async () => "3571",
  };
  const quotes = async (symbols: string[]) =>
    new Map<string, Quote>(
      symbols.map((s) => [
        s,
        {
          symbol: s,
          bid: null,
          bidSize: null,
          ask: null,
          askSize: null,
          last: Px.fromString("10"),
          ts: new Date(),
          source: "test",
          previousClose: null,
        },
      ]),
    );
  return {
    shares,
    quotes,
    activeInstruments: async () => counts.map((c) => ({ symbol: c.tickers[0]!, name: c.name })),
  };
}

describe("Top 100 job", () => {
  it("publishes a ranked snapshot, then refuses a wholesale reshuffle", async () => {
    const now = () => new Date("2026-09-30T21:00:00Z");
    const summary = await refreshTop100({ ...syntheticMarket(), store: marketCapRankings, now });
    expect(summary.top5).toEqual(["C120", "C119", "C118", "C117", "C116"]);

    const latest = await marketCapRankings.latest("top-100");
    expect(latest?.entries).toHaveLength(100);
    expect(latest?.entries[0]).toMatchObject({
      rank: 1,
      symbol: "C120",
      name: "Company 120 Inc.",
      shares: "120000",
      price: "10.0000",
      marketCap: "1200000.00",
    });

    // a different universe entirely: the previous top 10 vanished
    await expect(
      refreshTop100({ ...syntheticMarket(1000), store: marketCapRankings, now }),
    ).rejects.toThrow(/refused/);
    expect((await marketCapRankings.latest("top-100"))?.entries[0]?.symbol).toBe("C120");
  });
});

describe("browse API", () => {
  const req = (url: string) => new Request(`http://localhost${url}`);

  it("serves the seed until a snapshot exists, then the snapshot", async () => {
    const seeded = (await getBrowse()) as { top100: { asOf: string; preview: string[] } };
    expect(seeded.top100.asOf.startsWith("2026-09-30")).toBe(true);

    await refreshTop100({
      ...syntheticMarket(),
      store: marketCapRankings,
      now: () => new Date("2026-10-01T21:00:00Z"),
    });
    const live = (await getBrowse()) as { top100: { asOf: string; preview: string[] } };
    expect(live.top100).toMatchObject({
      asOf: "2026-10-01T21:00:00.000Z",
      preview: ["C120", "C119", "C118", "C117", "C116"],
    });
  });

  it("pages lists 25 at a time and 404s unknown lists", async () => {
    const first = (await getBrowseList("top-100", req("/api/v1/browse/top-100"))) as {
      instruments: Array<{ rank: number }>;
      nextPage: number | null;
      rankingAsOf: string;
    };
    expect(first.instruments.map((i) => i.rank)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(first.nextPage).toBe(1);
    expect(first.rankingAsOf).toBeTruthy();

    const last = (await getBrowseList("top-100", req("/api/v1/browse/top-100?page=3"))) as {
      instruments: Array<{ rank: number }>;
      nextPage: number | null;
    };
    expect(last.instruments[24]?.rank).toBe(100);
    expect(last.nextPage).toBeNull();

    const tech = (await getBrowseList("technology", req("/api/v1/browse/technology"))) as {
      instruments: Array<{ symbol: string; quote: { dayChange: unknown } | null }>;
      nextPage: number | null;
    };
    expect(tech.nextPage).toBeNull();
    expect(tech.instruments[0]).toMatchObject({ symbol: "AAPL" });
    expect(tech.instruments[0]!.quote?.dayChange).toBeTruthy();

    await expect(getBrowseList("nope", req("/api/v1/browse/nope"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
