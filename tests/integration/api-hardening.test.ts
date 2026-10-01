import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { resetRateLimitsForTests } from "@/server/api/rate-limit";
import { POST as provisionPOST } from "@/app/api/v1/account/provision/route";
import { POST as resetPOST } from "@/app/api/v1/account/reset/route";
import { GET as candlesGET } from "@/app/api/v1/instruments/[symbol]/candles/route";
import { GET as instrumentGET } from "@/app/api/v1/instruments/[symbol]/route";
import { GET as ledgerGET } from "@/app/api/v1/ledger/route";
import { GET as logoGET } from "@/app/api/v1/logos/[symbol]/route";
import { POST as cancelPOST } from "@/app/api/v1/orders/[id]/cancel/route";
import { GET as orderGET } from "@/app/api/v1/orders/[id]/route";
import { GET as ordersGET, POST as ordersPOST } from "@/app/api/v1/orders/route";
import { DELETE as watchlistItemDELETE } from "@/app/api/v1/watchlist/items/[id]/route";
import { POST as watchlistPOST } from "@/app/api/v1/watchlist/route";
import { signupWithAccount, truncateAll } from "./helpers";

/**
 * HTTP-level unhappy paths for /api/v1 (route handler → withAuth → envelope):
 * garbage input is a 4xx with the standard envelope — never a 500 — and a
 * user can never see or mutate another user's orders or watchlist items.
 */

type Handler = (request: Request) => Promise<Response>;
interface Envelope {
  error: { code: string; subcode?: string; message: string; requestId: string };
}

const PASSWORD = "correct horse 9";

async function cookieFor(email: string): Promise<string> {
  const res = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

/** A signed-in user with an ACTIVE funded account. */
async function trader(email: string) {
  const { userId, account } = await signupWithAccount(email);
  return { userId, account, cookie: await cookieFor(email) };
}

function call(
  handler: Handler,
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<Response> {
  const body =
    opts.body === undefined
      ? undefined
      : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
  return handler(
    new Request(`http://test.local${path}`, {
      method,
      headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      ...(body !== undefined ? { body } : {}),
    }),
  );
}

/** Asserts the standard error envelope and returns it. */
async function expectError(res: Response, status: number, code: string): Promise<Envelope> {
  const body = (await res.json()) as Envelope;
  expect({ status: res.status, code: body.error?.code }).toEqual({ status, code });
  expect(typeof body.error.requestId).toBe("string");
  expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|stack/i); // no internals
  return body;
}

function limitBuy(over: Record<string, unknown> = {}) {
  return {
    symbol: "AAPL",
    side: "BUY",
    type: "LIMIT",
    qty: 1,
    limitPrice: "100.00",
    idempotencyKey: crypto.randomUUID(),
    ...over,
  };
}

async function orderCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders);
  return row?.n ?? 0;
}

afterAll(closeDb);

beforeEach(async () => {
  await truncateAll();
  resetContainerForTests();
  resetRateLimitsForTests();
  getContainer().fixtureProvider!.setMarketStatus("OPEN");
  getContainer().fixtureProvider!.setPrice("AAPL", "200.0000");
});

describe("POST /api/v1/orders — validation", () => {
  it("a malformed JSON body is 422 VALIDATION, not a 500", async () => {
    const { cookie } = await trader("json@example.com");
    const res = await call(ordersPOST, "POST", "/api/v1/orders", { cookie, body: "{not json" });
    const body = await expectError(res, 422, "VALIDATION");
    expect(body.error.message).toBe("Request body must be JSON");
  });

  it("rejects garbage fields with 422 and creates no order row", async () => {
    const { cookie } = await trader("garbage@example.com");
    const cases: Array<Record<string, unknown>> = [
      { qty: 1.5 },
      { qty: -1 },
      { qty: 0 },
      { qty: 1_000_000_001 },
      { qty: "10" },
      { symbol: undefined },
      { symbol: "$$$" },
      { symbol: "ABCDEFGHIJK" },
      { side: "HOLD" },
      { type: "STOP" },
      { idempotencyKey: undefined },
      { idempotencyKey: "not-a-uuid" },
      { limitPrice: "0" },
      { limitPrice: "0.0000" },
      { limitPrice: "-5" },
      { limitPrice: "1.23456" },
      { limitPrice: "1e3" },
      { limitPrice: 100 },
      { limitPrice: "12345678901" }, // > NUMERIC(18,4) integer digits
    ];
    for (const over of cases) {
      const res = await call(ordersPOST, "POST", "/api/v1/orders", {
        cookie,
        body: limitBuy(over),
      });
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(((await res.json()) as Envelope).error.code).toBe("VALIDATION");
    }
    expect(await orderCount()).toBe(0);
  });

  it("limit/market price shape mismatches are INVALID_LIMIT_PRICE", async () => {
    const { cookie } = await trader("shape@example.com");
    const noPrice = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie,
      body: limitBuy({ limitPrice: undefined }),
    });
    expect((await expectError(noPrice, 422, "VALIDATION")).error.subcode).toBe(
      "INVALID_LIMIT_PRICE",
    );
    const marketWithPrice = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie,
      body: limitBuy({ type: "MARKET" }),
    });
    expect((await expectError(marketWithPrice, 422, "VALIDATION")).error.subcode).toBe(
      "INVALID_LIMIT_PRICE",
    );
    expect(await orderCount()).toBe(0);
  });

  it("an unknown symbol is 404 UNKNOWN_SYMBOL", async () => {
    const { cookie } = await trader("unknown@example.com");
    const res = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie,
      body: limitBuy({ symbol: "ZZZZZZ" }),
    });
    expect((await expectError(res, 404, "NOT_FOUND")).error.subcode).toBe("UNKNOWN_SYMBOL");
  });

  it("a user without an account gets ACCOUNT_NOT_ACTIVE", async () => {
    await getAuth().api.signUpEmail({
      body: { name: "N", email: "noacct@example.com", password: PASSWORD },
    });
    const cookie = await cookieFor("noacct@example.com");
    const res = await call(ordersPOST, "POST", "/api/v1/orders", { cookie, body: limitBuy() });
    expect((await expectError(res, 422, "DOMAIN_RULE")).error.subcode).toBe("ACCOUNT_NOT_ACTIVE");
  });

  it("anonymous mutations are 401 with the envelope", async () => {
    for (const [handler, path] of [
      [ordersPOST, "/api/v1/orders"],
      [provisionPOST, "/api/v1/account/provision"],
      [resetPOST, "/api/v1/account/reset"],
      [watchlistPOST, "/api/v1/watchlist"],
    ] as const) {
      await expectError(await call(handler, "POST", path, { body: {} }), 401, "AUTH_REQUIRED");
    }
  });
});

describe("GET /api/v1/orders — query validation", () => {
  it("accepts open/all and rejects anything else", async () => {
    const { cookie } = await trader("list@example.com");
    expect((await call(ordersGET, "GET", "/api/v1/orders?status=open", { cookie })).status).toBe(
      200,
    );
    expect((await call(ordersGET, "GET", "/api/v1/orders", { cookie })).status).toBe(200);
    await expectError(
      await call(ordersGET, "GET", "/api/v1/orders?status=bogus", { cookie }),
      422,
      "VALIDATION",
    );
  });
});

describe("order ownership (SECURITY.md: cross-user access is 404)", () => {
  async function aliceOrder() {
    const alice = await trader("alice@example.com");
    const res = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie: alice.cookie,
      body: limitBuy(), // limit 100 vs market 200: rests open
    });
    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: { id: string; state: string } };
    return { alice, order };
  }

  it("another user can neither read nor cancel the order, nor see it listed", async () => {
    const { alice, order } = await aliceOrder();
    const bob = await trader("bob@example.com");

    await expectError(
      await call(orderGET, "GET", `/api/v1/orders/${order.id}`, { cookie: bob.cookie }),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await call(cancelPOST, "POST", `/api/v1/orders/${order.id}/cancel`, { cookie: bob.cookie }),
      404,
      "NOT_FOUND",
    );
    const bobList = (await (
      await call(ordersGET, "GET", "/api/v1/orders", { cookie: bob.cookie })
    ).json()) as { orders: Array<{ id: string }> };
    expect(bobList.orders.map((o) => o.id)).not.toContain(order.id);

    // Bob's cancel attempt changed nothing; Alice still owns a live order.
    const [row] = await getDb().select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(row!.state).toBe(order.state);
    expect(
      (await call(orderGET, "GET", `/api/v1/orders/${order.id}`, { cookie: alice.cookie })).status,
    ).toBe(200);
  });

  it("an idempotency key is scoped to its owner — reuse never returns another user's order", async () => {
    const alice = await trader("alice2@example.com");
    const bob = await trader("bob2@example.com");
    const key = crypto.randomUUID();
    const first = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie: alice.cookie,
      body: limitBuy({ idempotencyKey: key }),
    });
    expect(first.status).toBe(201);
    const aliceOrderId = ((await first.json()) as { order: { id: string } }).order.id;

    const replay = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie: alice.cookie,
      body: limitBuy({ idempotencyKey: key }),
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { order: { id: string }; replayed: boolean };
    expect(replayBody).toMatchObject({ replayed: true, order: { id: aliceOrderId } });

    const bobs = await call(ordersPOST, "POST", "/api/v1/orders", {
      cookie: bob.cookie,
      body: limitBuy({ idempotencyKey: key }),
    });
    expect(bobs.status).toBe(201);
    expect(((await bobs.json()) as { order: { id: string } }).order.id).not.toBe(aliceOrderId);
  });

  it("malformed, unknown and badly-encoded order ids never 500", async () => {
    const { cookie } = await trader("ids@example.com");
    for (const id of ["not-a-uuid", crypto.randomUUID()]) {
      await expectError(
        await call(orderGET, "GET", `/api/v1/orders/${id}`, { cookie }),
        404,
        "NOT_FOUND",
      );
      await expectError(
        await call(cancelPOST, "POST", `/api/v1/orders/${id}/cancel`, { cookie }),
        404,
        "NOT_FOUND",
      );
    }
    await expectError(
      await call(orderGET, "GET", "/api/v1/orders/%E0%A4%A", { cookie }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(cancelPOST, "POST", "/api/v1/orders/%E0%A4%A/cancel", { cookie }),
      422,
      "VALIDATION",
    );
  });
});

describe("account + watchlist + market inputs", () => {
  it("provision rejects malformed bodies and non-integer cash", async () => {
    await getAuth().api.signUpEmail({
      body: { name: "P", email: "prov@example.com", password: PASSWORD },
    });
    const cookie = await cookieFor("prov@example.com");
    const post = (body: unknown) =>
      call(provisionPOST, "POST", "/api/v1/account/provision", { cookie, body });
    await expectError(await post("nope"), 422, "VALIDATION");
    await expectError(await post({ startingCash: "10000" }), 422, "VALIDATION");
    await expectError(await post({ startingCash: 10000.5 }), 422, "VALIDATION");
    await expectError(await post({}), 422, "VALIDATION");
    const outOfRange = await expectError(await post({ startingCash: 1e15 }), 422, "VALIDATION");
    expect(outOfRange.error.subcode).toBe("INVALID_STARTING_CASH");
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.accounts);
    expect(row?.n).toBe(0);
  });

  it("provision for a user who already has an account is 409", async () => {
    const { cookie } = await trader("dupe@example.com");
    const res = await call(provisionPOST, "POST", "/api/v1/account/provision", {
      cookie,
      body: { startingCash: 10000 },
    });
    expect((await expectError(res, 409, "CONFLICT")).error.subcode).toBe("ACCOUNT_EXISTS");
  });

  it("reset requires a JSON body with the exact confirmation", async () => {
    const { cookie } = await trader("reset@example.com");
    for (const body of ["", "{", { confirm: "reset" }, {}]) {
      await expectError(
        await call(resetPOST, "POST", "/api/v1/account/reset", { cookie, body }),
        422,
        "VALIDATION",
      );
    }
  });

  it("racing resets never 500 and always leave exactly one ACTIVE account", async () => {
    const { cookie, userId } = await trader("race@example.com");
    const reset = () =>
      call(resetPOST, "POST", "/api/v1/account/reset", { cookie, body: { confirm: "RESET" } });
    // Depending on interleaving the second request either resets the fresh
    // account again (200) or loses the lock race (409 / 422) — no reset is
    // idempotent by design, but none may crash or leave two open accounts.
    const statuses = (await Promise.all([reset(), reset()])).map((r) => r.status);
    expect(statuses).toContain(200);
    for (const s of statuses) expect([200, 409, 422]).toContain(s);
    const accounts = await getDb()
      .select({ status: schema.accounts.status })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(accounts.filter((a) => a.status === "ACTIVE")).toHaveLength(1);
    expect(accounts.every((a) => a.status === "ACTIVE" || a.status === "ARCHIVED")).toBe(true);
  });

  it("archiving when nothing is ACTIVE is a CONFLICT, not an invariant failure", async () => {
    await getAuth().api.signUpEmail({
      body: { name: "Z", email: "none@example.com", password: PASSWORD },
    });
    const [user] = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "none@example.com"));
    await expect(
      getContainer().accountService.archiveAndReprovision(user!.id),
    ).rejects.toMatchObject({ code: "CONFLICT", subcode: "ACCOUNT_NOT_ACTIVE" });
  });

  it("watchlist add/remove reject malformed input; removal is owner-scoped", async () => {
    const alice = await trader("wa@example.com");
    const bob = await trader("wb@example.com");
    await expectError(
      await call(watchlistPOST, "POST", "/api/v1/watchlist", { cookie: alice.cookie, body: "[" }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(watchlistPOST, "POST", "/api/v1/watchlist", {
        cookie: alice.cookie,
        body: { symbol: "<script>" },
      }),
      422,
      "VALIDATION",
    );
    const added = await call(watchlistPOST, "POST", "/api/v1/watchlist", {
      cookie: alice.cookie,
      body: { symbol: "AAPL" },
    });
    expect(added.status).toBe(201);
    const itemId = ((await added.json()) as { items: Array<{ id: string }> }).items[0]!.id;

    await expectError(
      await call(watchlistItemDELETE, "DELETE", "/api/v1/watchlist/items/%E0%A4%A", {
        cookie: alice.cookie,
      }),
      422,
      "VALIDATION",
    );
    const bobDelete = await call(
      watchlistItemDELETE,
      "DELETE",
      `/api/v1/watchlist/items/${itemId}`,
      { cookie: bob.cookie },
    );
    expect(bobDelete.status).toBe(200); // Bob's own (empty) list — nothing of Alice's leaks
    expect(((await bobDelete.json()) as { items: unknown[] }).items).toEqual([]);
    const still = await getDb()
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.id, itemId));
    expect(still).toHaveLength(1);
  });

  it("instrument, candle, ledger and logo inputs never 500", async () => {
    const { cookie } = await trader("mkt@example.com");
    await expectError(
      await call(instrumentGET, "GET", "/api/v1/instruments/%E0%A4%A", { cookie }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(instrumentGET, "GET", "/api/v1/instruments/A%20B", { cookie }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(candlesGET, "GET", "/api/v1/instruments/AAPL/candles?range=10Y", { cookie }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(candlesGET, "GET", "/api/v1/instruments/%E0%A4%A/candles", { cookie }),
      422,
      "VALIDATION",
    );
    await expectError(
      await call(ledgerGET, "GET", "/api/v1/ledger?before=oops", { cookie }),
      422,
      "VALIDATION",
    );
    const logo = await call(logoGET, "GET", "/api/v1/logos/%E0%A4%A", { cookie });
    expect(logo.status).toBe(404);
  });
});
