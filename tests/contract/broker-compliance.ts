import { describe, expect, it } from "vitest";
import type { Broker } from "@/core/execution";
import { Money, Px, Qty } from "@/core/money";
import type { CanonicalBrokerEvent } from "@/core/orders";

/**
 * Broker compliance suite (ADR-005/006): every Broker implementation must pass
 * these behaviors against the SAME canonical contract. The harness abstracts
 * venue-side market control so the suite stays implementation-agnostic.
 */
export interface BrokerComplianceHarness {
  /** Fresh broker + a provisioned account, market OPEN with a known symbol. */
  setup(): Promise<{ broker: Broker; brokerAccountId: string; symbol: string }>;
  /** Move the venue's market for the symbol (deterministic: fixture price). */
  setPrice(price: string): Promise<void>;
  /** Force the venue's session state. */
  setMarketOpen(open: boolean): Promise<void>;
  /** Trigger evaluation of resting orders (poll/tick — venue-dependent). */
  evaluate(broker: Broker): Promise<void>;
  /** Trigger DAY expiration (end-of-session). */
  expire(broker: Broker): Promise<void>;
  /** Split fills to exercise partial fills, where the venue supports forcing it. */
  chunkFills(broker: Broker, chunk: number): Promise<void>;
}

function collect(broker: Broker): CanonicalBrokerEvent[] {
  const events: CanonicalBrokerEvent[] = [];
  broker.subscribe(null, async (e) => {
    events.push(e);
  });
  return events;
}

function req(
  brokerAccountId: string,
  symbol: string,
  over: Partial<Parameters<Broker["submit"]>[0]> = {},
) {
  return {
    clientOrderId: crypto.randomUUID(),
    brokerAccountId,
    symbol,
    side: "BUY" as const,
    type: "MARKET" as const,
    qty: Qty.of(10),
    limitPrice: null,
    tif: "DAY" as const,
    extendedHours: false,
    ...over,
  };
}

export function brokerComplianceSuite(name: string, harness: BrokerComplianceHarness): void {
  describe(`Broker compliance: ${name}`, () => {
    it("market order: acknowledge -> accept -> fill events with execution ids", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const events = collect(broker);
      const request = req(brokerAccountId, symbol);
      const result = await broker.submit(request);
      expect(result.brokerOrderId).toBeTruthy();

      const types = events
        .filter((e) => e.clientOrderId === request.clientOrderId)
        .map((e) => e.type);
      expect(types[0]).toBe("ORDER_ACKNOWLEDGED");
      expect(types).toContain("ORDER_ACCEPTED");
      expect(types.at(-1)).toBe("ORDER_FILLED");

      const fills = events.filter((e) => e.fillQty);
      expect(fills.length).toBeGreaterThan(0);
      for (const f of fills) {
        expect(f.executionId).toBeTruthy();
        expect(f.fillPrice).toBeInstanceOf(Px);
        expect(f.fee).toBeInstanceOf(Money);
      }
      const totalFilled = fills.reduce((sum, f) => sum + f.fillQty!.toBigInt(), 0n);
      expect(totalFilled).toBe(10n);
    });

    it("duplicate clientOrderId is reported, never a second order", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const request = req(brokerAccountId, symbol);
      const first = await broker.submit(request);
      const second = await broker.submit(request);
      expect(second.duplicate).toBe(true);
      expect(second.brokerOrderId).toBe(first.brokerOrderId);
    });

    it("non-marketable limit rests; fills when the market crosses", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const events = collect(broker);
      const request = req(brokerAccountId, symbol, {
        type: "LIMIT",
        limitPrice: Px.fromString("190.0000"),
      });
      await broker.submit(request);
      let types = events.map((e) => e.type);
      expect(types).toContain("ORDER_ACCEPTED");
      expect(types).not.toContain("ORDER_FILLED");

      const open = await broker.listOpenOrders(brokerAccountId);
      expect(open.some((o) => o.clientOrderId === request.clientOrderId)).toBe(true);

      await harness.setPrice("189.0000");
      await harness.evaluate(broker);
      types = events.map((e) => e.type);
      expect(types).toContain("ORDER_FILLED");
      const fill = events.find((e) => e.type === "ORDER_FILLED")!;
      expect(Number(fill.fillPrice!.toString())).toBeLessThanOrEqual(190);
    });

    it("cancel of a resting order confirms CANCELLED", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const events = collect(broker);
      const request = req(brokerAccountId, symbol, {
        type: "LIMIT",
        limitPrice: Px.fromString("150.0000"),
      });
      await broker.submit(request);
      const result = await broker.cancel(brokerAccountId, request.clientOrderId);
      expect(result.accepted).toBe(true);
      expect(events.map((e) => e.type)).toContain("ORDER_CANCELLED");
    });

    it("cancel of a filled order is refused (fill won the race)", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const request = req(brokerAccountId, symbol);
      await broker.submit(request); // market -> filled immediately
      const result = await broker.cancel(brokerAccountId, request.clientOrderId);
      expect(result.accepted).toBe(false);
    });

    it("partial fills: multiple executions with distinct ids", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      await harness.chunkFills(broker, 4);
      const events = collect(broker);
      await broker.submit(req(brokerAccountId, symbol));
      const fills = events.filter((e) => e.fillQty);
      expect(fills.length).toBe(3); // 4 + 4 + 2
      expect(fills.slice(0, -1).every((f) => f.type === "ORDER_PARTIALLY_FILLED")).toBe(true);
      expect(fills.at(-1)!.type).toBe("ORDER_FILLED");
      expect(new Set(fills.map((f) => f.executionId)).size).toBe(3);
    });

    it("DAY orders expire with an EXPIRED event", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const events = collect(broker);
      await broker.submit(
        req(brokerAccountId, symbol, { type: "LIMIT", limitPrice: Px.fromString("150.0000") }),
      );
      await harness.expire(broker);
      expect(events.map((e) => e.type)).toContain("ORDER_EXPIRED");
    });

    it("closed market rejects via lifecycle events, not exceptions", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      await harness.setMarketOpen(false);
      const events = collect(broker);
      const request = req(brokerAccountId, symbol);
      await broker.submit(request);
      expect(events.map((e) => e.type)).toContain("ORDER_REJECTED");
    });

    it("subscription with a cursor replays missed events (stream recovery)", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const live = collect(broker);
      await broker.submit(req(brokerAccountId, symbol));
      expect(live.length).toBeGreaterThan(0);
      const cursorAt = live[0]!.externalEventId!;

      const replayed: CanonicalBrokerEvent[] = [];
      broker.subscribe({ lastExternalEventId: cursorAt }, async (e) => {
        replayed.push(e);
      });
      await new Promise((r) => setTimeout(r, 10));
      // Everything after the cursor is redelivered, in order.
      expect(replayed.map((e) => e.externalEventId)).toEqual(
        live.slice(1).map((e) => e.externalEventId),
      );
    });

    it("getOrderByClientId reflects venue truth for reconciliation", async () => {
      const { broker, brokerAccountId, symbol } = await harness.setup();
      const request = req(brokerAccountId, symbol);
      await broker.submit(request);
      const snapshot = await broker.getOrderByClientId(brokerAccountId, request.clientOrderId);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.filledQty.toBigInt()).toBe(10n);
      expect(await broker.getOrderByClientId(brokerAccountId, "nonexistent")).toBeNull();
    });
  });
}
