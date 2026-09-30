import { describe, expect, it } from "vitest";
import {
  activityExecutionId,
  AlpacaPaperBroker,
  eventsFromSnapshot,
  IncompleteFillsError,
  translateTradeEvent,
} from "@/infra/brokers/alpaca";

/** Recorded Alpaca trade-event payload shapes -> canonical events (ADR-005). */

const base = {
  account_id: "acct-1",
  order: { id: "bo-1", client_order_id: "arthosrot-order-1", status: "new" },
};

describe("Alpaca trade-event translation", () => {
  it("maps lifecycle statuses to canonical types", () => {
    const cases: Array<[string, string]> = [
      ["pending_new", "ORDER_ACKNOWLEDGED"],
      ["accepted", "ORDER_ACCEPTED"],
      ["new", "ORDER_ACCEPTED"],
      ["pending_cancel", "ORDER_CANCEL_PENDING"],
      ["canceled", "ORDER_CANCELLED"],
      ["rejected", "ORDER_REJECTED"],
      ["expired", "ORDER_EXPIRED"],
    ];
    for (const [vendor, canonical] of cases) {
      const event = translateTradeEvent({
        ...base,
        event_id: `01ULID${vendor}`,
        event: vendor,
        at: "2026-01-06T15:00:00Z",
      });
      expect(event.type).toBe(canonical);
      expect(event.externalEventId).toBe(`01ULID${vendor}`);
      expect(event.clientOrderId).toBe("arthosrot-order-1");
    }
  });

  it("carries per-execution fill fields with 4dp prices", () => {
    const event = translateTradeEvent({
      ...base,
      event_id: "01ULIDFILL",
      event: "partial_fill",
      timestamp: "2026-01-06T15:00:01Z",
      execution_id: "exec-77",
      price: "200.1",
      qty: "4",
    });
    expect(event.type).toBe("ORDER_PARTIALLY_FILLED");
    expect(event.executionId).toBe("exec-77");
    expect(event.fillQty!.toString()).toBe("4");
    expect(event.fillPrice!.toString()).toBe("200.1000");
  });

  it("unknown vendor statuses become UNKNOWN_VENDOR_STATUS (safe no-transition)", () => {
    const event = translateTradeEvent({
      ...base,
      event_id: "01ULIDNEW",
      event: "some_future_status",
    });
    expect(event.type).toBe("UNKNOWN_VENDOR_STATUS");
    expect(event.raw).toBeTruthy();
  });
});

describe("snapshot -> events synthesis (reconciliation path)", () => {
  it("uses the venue's execution ids so stream+REST duplicates collapse", () => {
    const events = eventsFromSnapshot(
      "acct-1",
      { id: "bo-1", client_order_id: "lo-1", status: "filled", filled_qty: "10" },
      [
        {
          id: "act-1",
          execution_id: "exec-1",
          order_id: "bo-1",
          transaction_time: "2026-01-06T15:00:01Z",
          price: "200.10",
          qty: "4",
          side: "buy",
          type: "partial_fill",
        },
        {
          id: "act-2",
          execution_id: "exec-2",
          order_id: "bo-1",
          transaction_time: "2026-01-06T15:00:02Z",
          price: "200.10",
          qty: "6",
          side: "buy",
          type: "fill",
        },
        {
          id: "act-x",
          execution_id: "exec-x",
          order_id: "OTHER",
          transaction_time: "2026-01-06T15:00:03Z",
          price: "1",
          qty: "1",
          side: "buy",
          type: "fill",
        },
      ],
    );
    expect(events.map((e) => e.type)).toEqual(["ORDER_PARTIALLY_FILLED", "ORDER_FILLED"]);
    expect(events.map((e) => e.executionId)).toEqual(["exec-1", "exec-2"]);
    expect(events.map((e) => e.fillQty!.toString())).toEqual(["4", "6"]);
  });

  it("non-fill terminal statuses synthesize a status event", () => {
    const events = eventsFromSnapshot(
      "acct-1",
      { id: "bo-2", client_order_id: "lo-2", status: "canceled", filled_qty: "0" },
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ORDER_CANCELLED");
  });
});

/**
 * Recorded from the Alpaca Broker API sandbox (2026-09-30) — the payloads a
 * missed market-open fill actually produced. The fill ACTIVITY carries
 * execution_id null and id "<timestamp>::<uuid>"; the STREAM event for the
 * same execution carries execution_id "<uuid>". Reconciliation must key the
 * fill identically, or one venue execution books twice.
 */
const REAL_ACTIVITY = {
  id: "20260903093003612::968ad49b-0f3a-4efa-afc6-0bb57f2b6ff8",
  execution_id: null,
  order_id: "280503e8-d7ba-44b8-934d-3fe36edd1aa2",
  transaction_time: "2026-09-03T13:30:03.612529Z",
  price: "324.85",
  qty: "5",
  side: "buy",
  type: "fill",
};
const REAL_ORDER = {
  id: "280503e8-d7ba-44b8-934d-3fe36edd1aa2",
  client_order_id: "a2ad8d28-8295-4fbd-ad7d-10d06b96027d",
  status: "filled",
  filled_qty: "5",
  submitted_at: "2026-09-03T11:00:11.606341Z",
};

describe("real sandbox payloads (the missed-fill incident)", () => {
  it("a reconciled fill carries the stream's execution id, so stream + REST collapse", () => {
    expect(activityExecutionId(REAL_ACTIVITY)).toBe("968ad49b-0f3a-4efa-afc6-0bb57f2b6ff8");
    const streamed = translateTradeEvent({
      account_id: "acct-1",
      event_id: "01M1KQCNEZ4EZQRAVBFF2AETQX",
      event: "fill",
      execution_id: "968ad49b-0f3a-4efa-afc6-0bb57f2b6ff8",
      price: "324.85",
      qty: "5",
      timestamp: "2026-09-03T13:30:03.612529083Z",
      order: { id: REAL_ORDER.id, client_order_id: REAL_ORDER.client_order_id, status: "filled" },
    });
    const [reconciled] = eventsFromSnapshot("acct-1", REAL_ORDER, [REAL_ACTIVITY]);
    expect(reconciled!.type).toBe("ORDER_FILLED");
    expect(reconciled!.executionId).toBe(streamed.executionId);
    expect(reconciled!.fillQty!.toString()).toBe("5");
    expect(reconciled!.fillPrice!.toString()).toBe("324.8500");
  });

  it("a filled order whose executions are not visible fails loudly, never 'in sync'", () => {
    expect(() => eventsFromSnapshot("acct-1", REAL_ORDER, [])).toThrow(IncompleteFillsError);
  });
});

describe("AlpacaPaperBroker fill lookup", () => {
  function recordingFetch(routes: (url: string) => Response) {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      return routes(url);
    };
    return { urls, fetchFn };
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("queries the Broker API activities endpoint with account_id as a query parameter", async () => {
    const { urls, fetchFn } = recordingFetch((url) =>
      url.includes("orders:by_client_order_id") ? json(REAL_ORDER) : json([REAL_ACTIVITY]),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const snap = await broker.getOrderByClientId("acct-1", REAL_ORDER.client_order_id);
    const activityUrl = new URL(urls.find((u) => u.includes("/activities/"))!);
    expect(activityUrl.pathname).toBe("/v1/accounts/activities/FILL");
    expect(activityUrl.searchParams.get("account_id")).toBe("acct-1");
    expect(activityUrl.searchParams.get("direction")).toBe("asc");
    expect(snap!.events.map((e) => e.type)).toEqual(["ORDER_FILLED"]);
  });

  it("an activities error propagates instead of reading as 'no fills'", async () => {
    const { fetchFn } = recordingFetch((url) =>
      url.includes("orders:by_client_order_id")
        ? json(REAL_ORDER)
        : new Response("Not Found", { status: 404 }),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    await expect(broker.getOrderByClientId("acct-1", REAL_ORDER.client_order_id)).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it("an unfilled order does not look up activities at all", async () => {
    const { urls, fetchFn } = recordingFetch(() =>
      json({ ...REAL_ORDER, status: "new", filled_qty: "0" }),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const snap = await broker.getOrderByClientId("acct-1", REAL_ORDER.client_order_id);
    expect(urls.some((u) => u.includes("/activities/"))).toBe(false);
    expect(snap!.events.map((e) => e.type)).toEqual(["ORDER_ACCEPTED"]);
  });
});
