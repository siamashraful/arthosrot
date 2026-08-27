import { describe, expect, it } from "vitest";
import { Money, Px, Qty } from "@/core/money";
import { AlpacaPaperBroker } from "@/infra/brokers/alpaca";

/**
 * EXTERNAL smoke suite — talks to the REAL Alpaca Broker API sandbox.
 * Never runs in CI (vitest excludes tests/external); invoked manually or via
 * the external-smoke workflow with sandbox credentials.
 *
 * Split by settlement latency (INTEGRATIONS.md, verified live): sandbox ACH
 * simulates a 10–30 minute clearing delay, and journals batch similarly, so
 * a fund-then-trade test cannot be fast AND reliable.
 *  - Trading lifecycle: runs every time, against an ALREADY-FUNDED account
 *    from a previous provisioning run (accounts persist in the sandbox).
 *  - Provisioning + settlement: full end-to-end including the funding wait
 *    (up to 35 min) — opt-in via SMOKE_PROVISION=1.
 */

const KEY = process.env.ALPACA_BROKER_KEY;
const SECRET = process.env.ALPACA_BROKER_SECRET;
const enabled = Boolean(KEY && SECRET);
const provisionEnabled = enabled && process.env.SMOKE_PROVISION === "1";

const SANDBOX = "https://broker-api.sandbox.alpaca.markets";

/** Direct sandbox call — account DISCOVERY only; all behavior under test goes
 *  through the adapter. */
async function listAccountIds(): Promise<string[]> {
  const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
  const res = await fetch(`${SANDBOX}/v1/accounts?status=ACTIVE`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as Array<{ id: string }>;
  return body.map((a) => a.id);
}

async function findFundedAccount(broker: AlpacaPaperBroker): Promise<string | null> {
  for (const id of await listAccountIds()) {
    const snap = await broker.getAccountSnapshot(id);
    if (snap.cash.gte(Money.fromString("1000.00"))) return id;
  }
  return null;
}

async function runLimitLifecycle(broker: AlpacaPaperBroker, accountId: string): Promise<void> {
  // Deeply non-marketable DAY limit: rests without filling.
  const clientOrderId = crypto.randomUUID();
  const request = {
    clientOrderId,
    brokerAccountId: accountId,
    symbol: "AAPL",
    side: "BUY" as const,
    type: "LIMIT" as const,
    qty: Qty.of(1),
    limitPrice: Px.fromString("1.0000"),
    tif: "DAY" as const,
    extendedHours: false,
  };
  const submit = await broker.submit(request);
  expect(submit.brokerOrderId).toBeTruthy();

  // Duplicate client_order_id is recovered, not duplicated (idempotency link 2).
  const dup = await broker.submit(request);
  expect(dup.duplicate).toBe(true);
  expect(dup.brokerOrderId).toBe(submit.brokerOrderId);

  // Venue truth via snapshot; then cancel and observe the terminal status.
  const snapshot = await broker.getOrderByClientId(accountId, clientOrderId);
  expect(snapshot?.brokerOrderId).toBe(submit.brokerOrderId);

  const cancel = await broker.cancel(accountId, clientOrderId);
  expect(cancel.accepted).toBe(true);

  // Sandbox cancellation is quick but asynchronous — poll briefly.
  let status = "";
  for (let i = 0; i < 10; i++) {
    const after = await broker.getOrderByClientId(accountId, clientOrderId);
    status = after?.status ?? "";
    if (status.startsWith("cancel")) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  expect(status.startsWith("cancel")).toBe(true);
}

describe.skipIf(!enabled)("Alpaca sandbox smoke", () => {
  it(
    "runs a limit place + duplicate-recovery + cancel lifecycle on a funded account",
    { timeout: 120_000 },
    async () => {
      const broker = new AlpacaPaperBroker(KEY!, SECRET!);
      const accountId = await findFundedAccount(broker);
      // First-ever run on a fresh sandbox: no funded account exists yet — run
      // with SMOKE_PROVISION=1 once to create one (funding settles in 10–30m).
      expect(
        accountId,
        "no funded sandbox account found — run once with SMOKE_PROVISION=1 first",
      ).not.toBeNull();
      await runLimitLifecycle(broker, accountId!);
    },
  );

  it.skipIf(!provisionEnabled)(
    "provisions a new account and waits for ACH settlement (SMOKE_PROVISION=1; up to ~35 min)",
    { timeout: 40 * 60_000 },
    async () => {
      const broker = new AlpacaPaperBroker(KEY!, SECRET!);
      const startingCash = Money.fromString("25000.00"); // = STARTING_CASH_MAX (venue caps $50k/acct/day)
      const ref = await broker.provisionAccount({
        arthosrotAccountId: crypto.randomUUID(),
        startingCash,
      });
      expect(ref.broker).toBe("ALPACA_PAPER");
      expect(ref.externalAccountId).toBeTruthy();

      // Poll the venue until the cash settles — the same gate tryActivate()
      // uses. Sandbox simulates ACH clearing at 10–30 minutes by design.
      const deadline = Date.now() + 35 * 60_000;
      let settled = await broker.getAccountSnapshot(ref.externalAccountId);
      while (settled.cash.compare(startingCash) < 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 30_000));
        settled = await broker.getAccountSnapshot(ref.externalAccountId);
      }
      expect(
        settled.cash.gte(startingCash),
        `funding never settled: cash=${settled.cash.toString()}`,
      ).toBe(true);

      await runLimitLifecycle(broker, ref.externalAccountId);
    },
  );
});
