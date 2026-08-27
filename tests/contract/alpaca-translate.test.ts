import { describe, expect, it } from "vitest";
import { eventsFromSnapshot, translateTradeEvent } from "@/infra/brokers/alpaca";

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
