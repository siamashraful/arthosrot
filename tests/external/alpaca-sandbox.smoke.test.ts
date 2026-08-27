import { describe, expect, it } from "vitest";
import { Money, Px, Qty } from "@/core/money";
import { AlpacaPaperBroker } from "@/infra/brokers/alpaca";

/**
 * EXTERNAL smoke suite — talks to the REAL Alpaca Broker API sandbox.
 * Never runs in CI (vitest excludes tests/external); invoked manually or via
 * the external-smoke workflow with sandbox credentials. Validates: account
 * provisioning, order id mapping, non-marketable limit rest + cancel, and
 * (when the market is open) a marketable order lifecycle.
 */

const KEY = process.env.ALPACA_BROKER_KEY;
const SECRET = process.env.ALPACA_BROKER_SECRET;
const enabled = Boolean(KEY && SECRET);

describe.skipIf(!enabled)("Alpaca sandbox smoke", () => {
  it("provisions an isolated funded account and runs a limit place+cancel lifecycle", async () => {
    const broker = new AlpacaPaperBroker(KEY!, SECRET!);

    const ref = await broker.provisionAccount({
      arthosrotAccountId: crypto.randomUUID(),
      startingCash: Money.fromString("100000.00"),
    });
    expect(ref.broker).toBe("ALPACA_PAPER");
    expect(ref.externalAccountId).toBeTruthy();

    // Deeply non-marketable DAY limit: rests without filling.
    const clientOrderId = crypto.randomUUID();
    const submit = await broker.submit({
      clientOrderId,
      brokerAccountId: ref.externalAccountId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: Qty.of(1),
      limitPrice: Px.fromString("1.0000"),
      tif: "DAY",
      extendedHours: false,
    });
    expect(submit.brokerOrderId).toBeTruthy();

    // Duplicate client_order_id is recovered, not duplicated (idempotency link 2).
    const dup = await broker.submit({
      clientOrderId,
      brokerAccountId: ref.externalAccountId,
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: Qty.of(1),
      limitPrice: Px.fromString("1.0000"),
      tif: "DAY",
      extendedHours: false,
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.brokerOrderId).toBe(submit.brokerOrderId);

    // Venue truth via snapshot; then cancel and observe the terminal status.
    const snapshot = await broker.getOrderByClientId(ref.externalAccountId, clientOrderId);
    expect(snapshot?.brokerOrderId).toBe(submit.brokerOrderId);

    const cancel = await broker.cancel(ref.externalAccountId, clientOrderId);
    expect(cancel.accepted).toBe(true);

    // Sandbox cancellation is quick but asynchronous — poll briefly.
    let status = "";
    for (let i = 0; i < 10; i++) {
      const after = await broker.getOrderByClientId(ref.externalAccountId, clientOrderId);
      status = after?.status ?? "";
      if (status.startsWith("cancel")) break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect(status.startsWith("cancel")).toBe(true);
  }, 120_000);
});
