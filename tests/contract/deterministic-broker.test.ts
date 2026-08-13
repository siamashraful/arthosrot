import { DeterministicPaperBroker } from "@/core/brokers/deterministic";
import { Money } from "@/core/money";
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
        ledgerlineAccountId: crypto.randomUUID(),
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
