import { describe, expect, it } from "vitest";
import { DeterministicPaperBroker } from "@/core/brokers/deterministic";
import { Money, Qty } from "@/core/money";
import type { Clock } from "@/core/shared";
import { FixtureProvider } from "@/infra/market-data";
import { brokerComplianceSuite, type BrokerComplianceHarness } from "./broker-compliance";

const fixedClock: Clock = { now: () => new Date("2026-01-06T15:00:00Z") };

function makeHarness(): BrokerComplianceHarness {
  let fixture: FixtureProvider;
  let current: DeterministicPaperBroker;
  return {
    async setup() {
      fixture = new FixtureProvider(fixedClock);
      fixture.setMarketStatus("OPEN");
      current = new DeterministicPaperBroker(fixedClock, fixture);
      const ref = await current.provisionAccount({
        arthosrotAccountId: crypto.randomUUID(),
        startingCash: Money.fromString("100000.00"),
      });
      return { broker: current, brokerAccountId: ref.externalAccountId, symbol: "AAPL" };
    },
    async setPrice(price) {
      fixture.setPrice("AAPL", price);
    },
    async setMarketOpen(open) {
      fixture.setMarketStatus(open ? "OPEN" : "CLOSED");
    },
    async evaluate(broker) {
      await (broker as DeterministicPaperBroker).tick();
    },
    async expire(broker) {
      await (broker as DeterministicPaperBroker).expireDayOrders();
    },
    async chunkFills(broker, chunk) {
      (broker as DeterministicPaperBroker).configure({ chunkFills: chunk });
    },
  };
}

brokerComplianceSuite("DeterministicPaperBroker", makeHarness());

describe("DeterministicPaperBroker id uniqueness (regression)", () => {
  it("event/execution ids never collide across broker instances", async () => {
    // Regression: ids land in unique DB columns where a collision reads as a
    // duplicate delivery and silently no-ops the event. Two fresh instances
    // (≈ two process restarts) must never reuse ids.
    const clock = { now: () => new Date("2026-01-06T15:00:00Z") };
    const ids = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const fixture = new FixtureProvider(clock);
      fixture.setMarketStatus("OPEN");
      const broker = new DeterministicPaperBroker(clock, fixture);
      const ref = await broker.provisionAccount({
        arthosrotAccountId: crypto.randomUUID(),
        startingCash: Money.fromString("1000.00"),
      });
      const events: string[] = [];
      broker.subscribe(null, async (e) => {
        if (e.externalEventId) events.push(e.externalEventId);
        if (e.executionId) events.push(e.executionId);
      });
      await broker.submit({
        clientOrderId: crypto.randomUUID(),
        brokerAccountId: ref.externalAccountId,
        symbol: "AAPL",
        side: "BUY",
        type: "MARKET",
        qty: Qty.of(1),
        limitPrice: null,
        tif: "DAY",
        extendedHours: false,
      });
      for (const id of events) {
        expect(ids.has(id), `id reused across instances: ${id}`).toBe(false);
        ids.add(id);
      }
    }
    expect(ids.size).toBeGreaterThanOrEqual(6);
  });
});
