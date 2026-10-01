import { describe, expect, it } from "vitest";
import type { VenueTransfer } from "@/core/cash-transfers";
import { Money } from "@/core/money";
import { AlpacaPaperBroker } from "@/infra/brokers/alpaca";

/**
 * EXTERNAL smoke for paper cash transfers (ADR-015) — talks to the REAL
 * Alpaca Broker API sandbox. Never runs in CI (tests/external is excluded by
 * vitest.config.ts); run with `pnpm test:external`.
 *
 * - Read-only (runs whenever sandbox keys are set): the adapter can list a
 *   funded account's transfers and look one up by id through the same
 *   paging path the settlement sweep uses.
 * - Writes (opt-in, SMOKE_TRANSFERS=1): a $1.00 ACH INCOMING deposit and a
 *   $1.00 ACH OUTGOING withdrawal on an already-funded sandbox account,
 *   polled until a terminal status (ACH simulates a 10–30 min clearing
 *   delay — INTEGRATIONS.md). This is the verification that outgoing ACH
 *   works in the sandbox; until it has passed, treat withdrawals on the
 *   Alpaca venue as unverified (ADR-015 open item).
 */

const KEY = process.env.ALPACA_BROKER_KEY;
const SECRET = process.env.ALPACA_BROKER_SECRET;
const enabled = Boolean(KEY && SECRET);
const writesEnabled = enabled && process.env.SMOKE_TRANSFERS === "1";

const SANDBOX = "https://broker-api.sandbox.alpaca.markets";

/** Direct sandbox call — account DISCOVERY only; behavior goes through the adapter. */
async function listAccountIds(): Promise<string[]> {
  const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
  const res = await fetch(`${SANDBOX}/v1/accounts?status=ACTIVE`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  expect(res.ok).toBe(true);
  return ((await res.json()) as Array<{ id: string }>).map((a) => a.id);
}

async function findFundedAccount(broker: AlpacaPaperBroker): Promise<string | null> {
  for (const id of await listAccountIds()) {
    const snap = await broker.getAccountSnapshot(id);
    if (snap.cash.gte(Money.fromString("10.00"))) return id;
  }
  return null;
}

async function pollTerminal(
  broker: AlpacaPaperBroker,
  ref: { broker: "ALPACA_PAPER"; externalAccountId: string },
  id: string,
): Promise<VenueTransfer> {
  const deadline = Date.now() + 35 * 60_000;
  let current = await broker.getTransfer(ref, id);
  while (current?.state === "PENDING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30_000));
    current = await broker.getTransfer(ref, id);
  }
  expect(current, "transfer vanished from the venue list").not.toBeNull();
  return current!;
}

describe.skipIf(!enabled)("Alpaca sandbox cash transfers", () => {
  it(
    "lists a funded account's transfers and finds each by id (read-only)",
    { timeout: 60_000 },
    async () => {
      const broker = new AlpacaPaperBroker(KEY!, SECRET!);
      const accountId = await findFundedAccount(broker);
      expect(accountId, "no funded sandbox account — see alpaca-sandbox.smoke").not.toBeNull();
      const ref = { broker: "ALPACA_PAPER" as const, externalAccountId: accountId! };
      const { transfers, complete } = await broker.listTransfers(ref, new Date(0));
      // Every row is readable; the opening ACH deposit is excluded from the
      // listing (it is not a user transfer), so it may be empty.
      expect(complete).toBe(true);
      const first = transfers[0];
      if (first) {
        const found = await broker.getTransfer(ref, first.venueTransferId);
        expect(found?.venueTransferId).toBe(first.venueTransferId);
      }
      expect(await broker.getTransfer(ref, crypto.randomUUID())).toBeNull();
    },
  );

  it.skipIf(!writesEnabled)(
    "deposits and withdraws $1.00 over ACH and observes terminal statuses (SMOKE_TRANSFERS=1; up to ~70 min)",
    { timeout: 75 * 60_000 },
    async () => {
      const broker = new AlpacaPaperBroker(KEY!, SECRET!);
      const accountId = await findFundedAccount(broker);
      expect(accountId).not.toBeNull();
      const ref = { broker: "ALPACA_PAPER" as const, externalAccountId: accountId! };
      const amount = Money.fromString("1.00");

      const dep = await broker.initiate(ref, {
        transferId: crypto.randomUUID(),
        direction: "DEPOSIT",
        amount,
      });
      expect(dep.direction).toBe("DEPOSIT");
      expect(dep.amount.toString()).toBe("1.00");
      const depFinal = await pollTerminal(broker, ref, dep.venueTransferId);
      expect(depFinal.state).toBe("SETTLED");

      const wd = await broker.initiate(ref, {
        transferId: crypto.randomUUID(),
        direction: "WITHDRAWAL",
        amount,
      });
      expect(wd.direction).toBe("WITHDRAWAL");
      const wdFinal = await pollTerminal(broker, ref, wd.venueTransferId);
      // Record the outcome in INTEGRATIONS.md either way.
      expect(wdFinal.state, `withdrawal ended ${wdFinal.state}: ${wdFinal.failureReason}`).toBe(
        "SETTLED",
      );
    },
  );
});
