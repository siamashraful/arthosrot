import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PriceAlertService } from "@/core/alerts";
import { ProviderUnavailableError } from "@/core/market-data";
import { Px } from "@/core/money";
import { systemClock } from "@/core/shared";
import { closeDb, getDb, schema } from "@/infra/db";
import { priceAlertsRepository } from "@/infra/db/repositories/price-alerts";
import { pgTransactionRunner } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import {
  createAlert,
  deleteAlert,
  getUnreadCount,
  listAlerts,
  markAlertsRead,
} from "@/server/api/alerts";
import { errorResponse } from "@/server/api/http";
import type { SessionInfo } from "@/server/session";
import { runDueJobs } from "@/worker/jobs/registry";
import { PRICE_ALERTS_JOB, priceAlertsJob } from "@/worker/jobs/price-alerts";
import { truncateAll } from "./helpers";

/**
 * Price alerts (ADR-016) against real Postgres + the fixture market: API
 * validation and ownership, the active cap and idempotent duplicates, the
 * opportunistic evaluation on GET (driven by FixtureProvider.setPrice), the
 * stale-quote and session rules, and the job's exactly-once triggering under
 * concurrent evaluations.
 */

interface AlertBody {
  id: string;
  symbol: string;
  direction: "ABOVE" | "BELOW";
  threshold: string;
  state: "ACTIVE" | "TRIGGERED" | "CANCELED";
  createdAt: string;
  triggeredAt: string | null;
  triggerPrice: string | null;
  triggerQuoteAt: string | null;
  readAt: string | null;
}

async function user(email: string): Promise<SessionInfo> {
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  return { userId: res.user.id, email, name: "T" };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://test.local${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function create(session: SessionInfo, body: unknown) {
  const res = await createAlert(post("/api/v1/alerts", body), session);
  return { status: res.status, ...(res.body as { alert: AlertBody; created: boolean }) };
}

async function list(session: SessionInfo) {
  return (await listAlerts(session)) as { alerts: AlertBody[]; unreadCount: number };
}

/** Run an API call; on rejection return the HTTP envelope the route would send. */
async function failure(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    const res = errorResponse(err, "test");
    const body = (await res.json()) as { error: { code: string; subcode?: string } };
    return { status: res.status, ...body.error };
  }
  throw new Error("expected the call to fail");
}

const fixture = () => getContainer().fixtureProvider!;

async function rows() {
  return getDb().select().from(schema.priceAlerts);
}

beforeEach(async () => {
  await truncateAll();
  resetContainerForTests();
  fixture().setMarketStatus("OPEN");
  fixture().setPrice("AAPL", "200.0000");
  fixture().setPrice("MSFT", "410.5000");
});
afterAll(closeDb);

describe("POST /api/v1/alerts — validation", () => {
  it("creates an ACTIVE alert with a canonical 4dp threshold (201)", async () => {
    const s = await user("create@example.com");
    const res = await create(s, { symbol: "aapl", direction: "ABOVE", price: "210" });
    expect(res.status).toBe(201);
    expect(res.created).toBe(true);
    expect(res.alert).toMatchObject({
      symbol: "AAPL",
      direction: "ABOVE",
      threshold: "210.0000",
      state: "ACTIVE",
      triggeredAt: null,
      triggerPrice: null,
      readAt: null,
    });
  });

  it("an identical ACTIVE alert is idempotent: 200 with the same alert, no second row", async () => {
    const s = await user("dup@example.com");
    const first = await create(s, { symbol: "AAPL", direction: "BELOW", price: "190.5" });
    const again = await create(s, { symbol: "AAPL", direction: "BELOW", price: "190.5000" });
    expect(again.status).toBe(200);
    expect(again.created).toBe(false);
    expect(again.alert.id).toBe(first.alert.id);
    // different terms are different alerts
    const other = await create(s, { symbol: "AAPL", direction: "ABOVE", price: "190.5" });
    expect(other.status).toBe(201);
    expect(await rows()).toHaveLength(2);
  });

  it.each([
    ["malformed JSON", "{not json", 422, "VALIDATION", undefined],
    ["missing price", { symbol: "AAPL", direction: "ABOVE" }, 422, "VALIDATION", undefined],
    [
      "numeric price",
      { symbol: "AAPL", direction: "ABOVE", price: 210 },
      422,
      "VALIDATION",
      undefined,
    ],
    [
      "bad direction",
      { symbol: "AAPL", direction: "UP", price: "210" },
      422,
      "VALIDATION",
      undefined,
    ],
    [
      "5dp price",
      { symbol: "AAPL", direction: "ABOVE", price: "210.00001" },
      422,
      "VALIDATION",
      "INVALID_ALERT_PRICE",
    ],
    [
      "zero price",
      { symbol: "AAPL", direction: "ABOVE", price: "0.00" },
      422,
      "VALIDATION",
      "INVALID_ALERT_PRICE",
    ],
    [
      "negative price",
      { symbol: "AAPL", direction: "ABOVE", price: "-1" },
      422,
      "VALIDATION",
      "INVALID_ALERT_PRICE",
    ],
    [
      "bad symbol",
      { symbol: "AA PL", direction: "ABOVE", price: "1" },
      422,
      "VALIDATION",
      undefined,
    ],
    [
      "unknown symbol",
      { symbol: "ZZZZ", direction: "ABOVE", price: "1" },
      404,
      "NOT_FOUND",
      "UNKNOWN_SYMBOL",
    ],
  ])("rejects %s", async (_label, body, status, code, subcode) => {
    const s = await user(`bad-${Math.random()}@example.com`);
    const err = await failure(() => createAlert(post("/api/v1/alerts", body), s));
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    if (subcode) expect(err.subcode).toBe(subcode);
    expect(await rows()).toHaveLength(0);
  });

  it("refuses an inactive (delisted) instrument", async () => {
    const s = await user("inactive@example.com");
    await getContainer().instrumentService.getOrRegister("MSFT");
    await getDb()
      .update(schema.instruments)
      .set({ status: "INACTIVE" })
      .where(eq(schema.instruments.symbol, "MSFT"));
    const err = await failure(() =>
      createAlert(post("/api/v1/alerts", { symbol: "MSFT", direction: "ABOVE", price: "500" }), s),
    );
    expect(err).toMatchObject({ status: 422, code: "DOMAIN_RULE", subcode: "INSTRUMENT_INACTIVE" });
  });

  it("caps ACTIVE alerts at 50 per user; triggered and deleted alerts don't count", async () => {
    const s = await user("cap@example.com");
    const svc = getContainer().priceAlertService;
    for (let i = 1; i <= 50; i += 1) {
      await svc.create({
        userId: s.userId,
        symbol: "AAPL",
        direction: "ABOVE",
        threshold: Px.fromString(`${300 + i}`),
      });
    }
    const err = await failure(() =>
      create(s, { symbol: "AAPL", direction: "ABOVE", price: "999" }),
    );
    expect(err).toMatchObject({ status: 422, code: "DOMAIN_RULE", subcode: "ALERT_LIMIT_REACHED" });
    // an identical ACTIVE alert is still returned at the cap (idempotent, not a new row)
    expect((await create(s, { symbol: "AAPL", direction: "ABOVE", price: "301" })).status).toBe(
      200,
    );

    const victim = (await list(s)).alerts[0]!;
    await deleteAlert(victim.id, s);
    expect((await create(s, { symbol: "AAPL", direction: "ABOVE", price: "999" })).status).toBe(
      201,
    );
  });

  it("two concurrent creates at 49 active can't both pass the cap", async () => {
    const s = await user("cap-race@example.com");
    const svc = getContainer().priceAlertService;
    for (let i = 1; i <= 49; i += 1) {
      await svc.create({
        userId: s.userId,
        symbol: "MSFT",
        direction: "BELOW",
        threshold: Px.fromString(`${i}`),
      });
    }
    const results = await Promise.allSettled([
      create(s, { symbol: "AAPL", direction: "ABOVE", price: "500" }),
      create(s, { symbol: "AAPL", direction: "ABOVE", price: "501" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [active] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.priceAlerts)
      .where(eq(schema.priceAlerts.state, "ACTIVE"));
    expect(active!.n).toBe(50);
  });

  it("two concurrent identical creates make one row", async () => {
    const s = await user("dup-race@example.com");
    const body = { symbol: "AAPL", direction: "ABOVE", price: "250" };
    const [a, b] = await Promise.all([create(s, body), create(s, body)]);
    expect(a.alert.id).toBe(b.alert.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await rows()).toHaveLength(1);
  });
});

describe("ownership", () => {
  it("another user's alert is invisible and undeletable (404)", async () => {
    const alice = await user("alice@example.com");
    const bob = await user("bob@example.com");
    const { alert } = await create(alice, { symbol: "AAPL", direction: "ABOVE", price: "210" });

    expect((await list(bob)).alerts).toEqual([]);
    expect(await failure(() => deleteAlert(alert.id, bob))).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect((await list(alice)).alerts.map((a) => a.id)).toEqual([alert.id]);
  });

  it("malformed and already-deleted ids are 404", async () => {
    const s = await user("del@example.com");
    expect(await failure(() => deleteAlert("not-a-uuid", s))).toMatchObject({ status: 404 });
    const { alert } = await create(s, { symbol: "AAPL", direction: "ABOVE", price: "210" });
    const res = (await deleteAlert(alert.id, s)) as { alert: AlertBody };
    expect(res.alert.state).toBe("CANCELED");
    expect(await failure(() => deleteAlert(alert.id, s))).toMatchObject({ status: 404 });
    expect((await list(s)).alerts).toEqual([]); // soft-deleted: gone from the list
    expect((await rows())[0]!.canceledAt).not.toBeNull(); // …but the row is kept
  });

  it("marking read only touches the caller's own triggered alerts", async () => {
    const alice = await user("ra@example.com");
    const bob = await user("rb@example.com");
    const a = await create(alice, { symbol: "AAPL", direction: "ABOVE", price: "205" });
    await create(bob, { symbol: "AAPL", direction: "ABOVE", price: "205" });
    fixture().setPrice("AAPL", "206.0000");
    await getContainer().priceAlertService.evaluateAll();

    const bobRead = (await markAlertsRead(
      post("/api/v1/alerts/read", { ids: [a.alert.id] }),
      bob,
    )) as {
      updated: number;
    };
    expect(bobRead.updated).toBe(0);
    expect((await getUnreadCount(alice)) as { unreadCount: number }).toEqual({ unreadCount: 1 });
    expect((await getUnreadCount(bob)) as { unreadCount: number }).toEqual({ unreadCount: 1 });
  });

  it("mark-read body: empty means all; malformed JSON is 422", async () => {
    const s = await user("readbody@example.com");
    const err = await failure(() => markAlertsRead(post("/api/v1/alerts/read", "{oops"), s));
    expect(err).toMatchObject({ status: 422, code: "VALIDATION" });
    const empty = new Request("http://test.local/api/v1/alerts/read", { method: "POST" });
    expect(await markAlertsRead(empty, s)).toEqual({ updated: 0, unreadCount: 0 });
  });
});

describe("opportunistic evaluation on GET", () => {
  it("triggers exactly at the threshold on the next read, once, with the observed price", async () => {
    const s = await user("opp@example.com");
    const { alert } = await create(s, { symbol: "AAPL", direction: "ABOVE", price: "210.00" });

    expect((await list(s)).alerts[0]!.state).toBe("ACTIVE");

    fixture().setPrice("AAPL", "210.0000");
    const after = await list(s);
    expect(after.unreadCount).toBe(1);
    expect(after.alerts[0]).toMatchObject({
      id: alert.id,
      state: "TRIGGERED",
      triggerPrice: "210.0000",
      readAt: null,
    });
    expect(after.alerts[0]!.triggeredAt).not.toBeNull();
    expect(after.alerts[0]!.triggerQuoteAt).not.toBeNull();

    // one-shot: the price falling back and rising again changes nothing
    fixture().setPrice("AAPL", "190.0000");
    await list(s);
    fixture().setPrice("AAPL", "230.0000");
    const later = await list(s);
    expect(later.alerts[0]).toMatchObject({ state: "TRIGGERED", triggerPrice: "210.0000" });

    // reading marks it read; unread-count agrees
    const read = (await markAlertsRead(post("/api/v1/alerts/read", {}), s)) as {
      updated: number;
      unreadCount: number;
    };
    expect(read).toEqual({ updated: 1, unreadCount: 0 });
    expect(await getUnreadCount(s)).toEqual({ unreadCount: 0 });
    expect((await list(s)).alerts[0]!.readAt).not.toBeNull();
  });

  it("BELOW alerts trigger on the way down; the bell's unread-count read also evaluates", async () => {
    const s = await user("below@example.com");
    await create(s, { symbol: "MSFT", direction: "BELOW", price: "400" });
    fixture().setPrice("MSFT", "400.0001");
    expect(await getUnreadCount(s)).toEqual({ unreadCount: 0 });
    fixture().setPrice("MSFT", "399.9900");
    expect(await getUnreadCount(s)).toEqual({ unreadCount: 1 });
    expect((await list(s)).alerts[0]!.triggerPrice).toBe("399.9900");
  });

  it("never triggers on a stale quote", async () => {
    const s = await user("stale@example.com");
    await create(s, { symbol: "AAPL", direction: "ABOVE", price: "210" });
    fixture().setPrice("AAPL", "250.0000");
    fixture().setQuoteTimestamp(new Date(Date.now() - 16 * 60_000));
    expect((await list(s)).alerts[0]!.state).toBe("ACTIVE");
    fixture().setQuoteTimestamp(null); // a fresh quote arrives
    expect((await list(s)).alerts[0]!.state).toBe("TRIGGERED");
  });

  it("gap rule: off-session prices never trigger; the first fresh in-session quote does, at its own price", async () => {
    const s = await user("gap@example.com");
    await create(s, { symbol: "AAPL", direction: "ABOVE", price: "210" });
    fixture().setPrice("AAPL", "215.0000");
    for (const status of ["CLOSED", "PRE", "POST"] as const) {
      fixture().setMarketStatus(status);
      expect((await list(s)).alerts[0]!.state).toBe("ACTIVE");
    }
    fixture().setMarketStatus("OPEN");
    const opened = await list(s);
    expect(opened.alerts[0]).toMatchObject({ state: "TRIGGERED", triggerPrice: "215.0000" });
  });

  it("a provider outage never breaks the read", async () => {
    const s = await user("outage@example.com");
    await create(s, { symbol: "AAPL", direction: "ABOVE", price: "1" });
    const f = fixture();
    const original = f.getQuotes.bind(f);
    f.getQuotes = async () => {
      throw new ProviderUnavailableError("feed down");
    };
    try {
      const res = await list(s);
      expect(res.alerts[0]!.state).toBe("ACTIVE");
    } finally {
      f.getQuotes = original;
    }
  });

  it("re-arm is a new alert; the triggered one keeps its history", async () => {
    const s = await user("rearm@example.com");
    await create(s, { symbol: "AAPL", direction: "ABOVE", price: "205" });
    fixture().setPrice("AAPL", "206.0000");
    await list(s);
    fixture().setPrice("AAPL", "200.0000");
    const rearmed = await create(s, { symbol: "AAPL", direction: "ABOVE", price: "205" });
    expect(rearmed.status).toBe(201);
    const all = (await list(s)).alerts;
    expect(all.map((a) => a.state)).toEqual(["ACTIVE", "TRIGGERED"]); // newest first
  });
});

describe("price-alerts job", () => {
  async function seed() {
    const a = await user("job-a@example.com");
    const b = await user("job-b@example.com");
    // 3 will trigger (AAPL ≥ 205 twice, MSFT ≤ 400), 2 won't
    await create(a, { symbol: "AAPL", direction: "ABOVE", price: "205" });
    await create(b, { symbol: "AAPL", direction: "ABOVE", price: "205.0000" }); // b's own
    await create(a, { symbol: "MSFT", direction: "BELOW", price: "400" });
    await create(a, { symbol: "AAPL", direction: "BELOW", price: "100" });
    await create(b, { symbol: "MSFT", direction: "ABOVE", price: "500" });
    fixture().setPrice("AAPL", "205.5000");
    fixture().setPrice("MSFT", "399.0000");
    return { a, b };
  }

  async function triggeredCount() {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.priceAlerts)
      .where(eq(schema.priceAlerts.state, "TRIGGERED"));
    return row!.n;
  }

  it("two concurrent evaluations trigger each alert exactly once", async () => {
    await seed();
    const svc = getContainer().priceAlertService;
    const [r1, r2, r3] = await Promise.all([
      svc.evaluateAll(),
      svc.evaluateAll(),
      svc.evaluateAll(),
    ]);
    expect(r1!.triggered + r2!.triggered + r3!.triggered).toBe(3);
    expect(await triggeredCount()).toBe(3);
    // a later tick finds nothing left to trigger
    expect((await svc.evaluateAll()).triggered).toBe(0);
    expect(await triggeredCount()).toBe(3);
  });

  it("the job and a user's GET racing on the same alert trigger it once", async () => {
    const { a } = await seed();
    const svc = getContainer().priceAlertService;
    const [job] = await Promise.all([svc.evaluateAll(), listAlerts(a), listAlerts(a)]);
    expect(job.symbols).toBe(2);
    expect(await triggeredCount()).toBe(3);
    const aTriggered = await getDb()
      .select()
      .from(schema.priceAlerts)
      .where(
        and(eq(schema.priceAlerts.userId, a.userId), eq(schema.priceAlerts.state, "TRIGGERED")),
      );
    expect(aTriggered.map((r) => r.triggerPrice).sort()).toEqual(["205.5000", "399.0000"]);
  });

  it("runs through the job registry on its interval and skips off-session without quoting", async () => {
    await seed();
    let quoted = 0;
    const f = fixture();
    const original = f.getQuotes.bind(f);
    f.getQuotes = async (symbols) => {
      quoted += 1;
      return original(symbols);
    };
    try {
      f.setMarketStatus("CLOSED");
      let now = new Date("2026-10-01T14:00:00Z");
      const tick = () => runDueJobs([priceAlertsJob()], { now: () => now });
      const closed = await tick();
      expect(closed[0]).toMatchObject({ name: PRICE_ALERTS_JOB, status: "ran" });
      expect(quoted).toBe(0);
      expect(await triggeredCount()).toBe(0);

      f.setMarketStatus("OPEN");
      now = new Date(now.getTime() + 60_000);
      expect((await tick())[0]!.status).toBe("not-due"); // default interval 5m
      now = new Date(now.getTime() + 5 * 60_000);
      const ran = await tick();
      expect(ran[0]).toMatchObject({ status: "ran", result: { triggered: 3 } });
      expect(quoted).toBe(1); // one batched call for both symbols
    } finally {
      f.getQuotes = original;
    }
  });

  it("deleting an alert before the tick means it never triggers", async () => {
    const { a } = await seed();
    // read the row directly: a GET would evaluate (and trigger) it first
    const [mine] = await getDb()
      .select()
      .from(schema.priceAlerts)
      .where(and(eq(schema.priceAlerts.userId, a.userId), eq(schema.priceAlerts.symbol, "MSFT")));
    if (!mine) throw new Error("seeded MSFT alert missing");
    await deleteAlert(mine.id, a);
    await getContainer().priceAlertService.evaluateAll();
    const [row] = await getDb()
      .select()
      .from(schema.priceAlerts)
      .where(eq(schema.priceAlerts.id, mine.id));
    expect(row).toMatchObject({ state: "CANCELED", triggeredAt: null, triggerPrice: null });
  });

  it("fails the run (so the registry retries) when no quotes can be fetched", async () => {
    await seed();
    const svc = new PriceAlertService(
      priceAlertsRepository,
      {
        getMarketStatus: async () => ({ status: "OPEN", asOf: new Date() }),
        getQuotes: async () => {
          throw new ProviderUnavailableError("feed down");
        },
      },
      pgTransactionRunner,
      systemClock,
    );
    const out = await runDueJobs([priceAlertsJob(() => svc.evaluateAll())], { force: true });
    expect(out[0]).toMatchObject({ status: "failed" });
    expect(await triggeredCount()).toBe(0);
  });
});

describe("schema backstops", () => {
  it("refuses a non-positive threshold, a bad direction and a duplicate ACTIVE alert", async () => {
    const s = await user("db@example.com");
    const base = { userId: s.userId, symbol: "AAPL", direction: "ABOVE" as const };
    await expect(
      getDb()
        .insert(schema.priceAlerts)
        .values({ ...base, threshold: "0" }),
    ).rejects.toThrow();
    await expect(
      getDb()
        .insert(schema.priceAlerts)
        .values({ ...base, direction: "SIDEWAYS" as "ABOVE", threshold: "1" }),
    ).rejects.toThrow();
    await getDb()
      .insert(schema.priceAlerts)
      .values({ ...base, threshold: "5" });
    await expect(
      getDb()
        .insert(schema.priceAlerts)
        .values({ ...base, threshold: "5.0000" }),
    ).rejects.toThrow();
    // TRIGGERED without trigger facts is impossible
    await expect(
      getDb()
        .insert(schema.priceAlerts)
        .values({ ...base, threshold: "6", state: "TRIGGERED" }),
    ).rejects.toThrow();
  });
});
