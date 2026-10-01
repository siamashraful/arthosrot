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

describe("DeterministicPaperBroker as CashTransferVenue (ADR-015)", () => {
  async function venue() {
    const fixture = new FixtureProvider(fixedClock);
    const broker = new DeterministicPaperBroker(fixedClock, fixture);
    const ref = await broker.provisionAccount({
      arthosrotAccountId: crypto.randomUUID(),
      startingCash: Money.fromString("1000.00"),
    });
    return { broker, ref };
  }
  const amount = Money.fromString("250.00");

  it("settles synchronously by default and moves venue cash both ways", async () => {
    const { broker, ref } = await venue();
    const dep = await broker.initiate(ref, { transferId: "a", direction: "DEPOSIT", amount });
    expect(dep.state).toBe("SETTLED");
    expect((await broker.getAccountSnapshot(ref.externalAccountId)).cash.toString()).toBe(
      "1250.00",
    );
    const wd = await broker.initiate(ref, { transferId: "b", direction: "WITHDRAWAL", amount });
    expect(wd.state).toBe("SETTLED");
    expect((await broker.getAccountSnapshot(ref.externalAccountId)).cash.toString()).toBe(
      "1000.00",
    );
    expect((await broker.getTransfer(ref, wd.venueTransferId))?.state).toBe("SETTLED");
    expect(await broker.getTransfer(ref, "unknown")).toBeNull();
  });

  it("held transfers stay PENDING until completed or failed (async venue simulation)", async () => {
    const { broker, ref } = await venue();
    broker.holdTransfers(true);
    const t = await broker.initiate(ref, { transferId: "a", direction: "DEPOSIT", amount });
    expect(t.state).toBe("PENDING");
    expect((await broker.getAccountSnapshot(ref.externalAccountId)).cash.toString()).toBe(
      "1000.00",
    );
    broker.completeTransfer(t.venueTransferId);
    broker.completeTransfer(t.venueTransferId); // idempotent at the venue too
    expect((await broker.getAccountSnapshot(ref.externalAccountId)).cash.toString()).toBe(
      "1250.00",
    );

    const f = await broker.initiate(ref, { transferId: "b", direction: "WITHDRAWAL", amount });
    broker.failTransfer(f.venueTransferId, "R01");
    const failed = await broker.getTransfer(ref, f.venueTransferId);
    expect(failed).toMatchObject({ state: "FAILED", failureReason: "R01" });
    const listing = await broker.listTransfers(ref, new Date(0));
    expect(listing.complete).toBe(true);
    expect(listing.transfers.map((x) => x.venueTransferId)).toEqual([
      t.venueTransferId,
      f.venueTransferId,
    ]);

    // cancel: only a PENDING venue transfer can be canceled (it then FAILS)
    broker.holdTransfers(true);
    const p = await broker.initiate(ref, { transferId: "c", direction: "DEPOSIT", amount });
    expect(await broker.cancelTransfer(ref, p.venueTransferId)).toBe(true);
    expect(await broker.getTransfer(ref, p.venueTransferId)).toMatchObject({ state: "FAILED" });
    expect(await broker.cancelTransfer(ref, p.venueTransferId)).toBe(false);
    expect(await broker.cancelTransfer(ref, t.venueTransferId)).toBe(false); // settled
  });

  it("fault hooks: definitive rejection vs ambiguous timeout", async () => {
    const { broker, ref } = await venue();
    const { TransferRejectedError } = await import("@/core/cash-transfers");
    broker.failNextTransfer("reject");
    await expect(
      broker.initiate(ref, { transferId: "a", direction: "DEPOSIT", amount }),
    ).rejects.toBeInstanceOf(TransferRejectedError);
    broker.failNextTransfer("timeout");
    const err = await broker
      .initiate(ref, { transferId: "b", direction: "DEPOSIT", amount })
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TransferRejectedError);
    // faults are one-shot
    expect(
      (await broker.initiate(ref, { transferId: "c", direction: "DEPOSIT", amount })).state,
    ).toBe("SETTLED");
  });
});
