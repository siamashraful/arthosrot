import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/core/shared";
import { closeDb, getDb, schema } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { getMe, provisionAccount } from "@/server/api/portfolio";
import type { SessionInfo } from "@/server/session";
import { truncateAll } from "./helpers";

/**
 * Async account provisioning (FR-2). Venue funding is asynchronous at real
 * venues (Alpaca ACH settles minutes later — INTEGRATIONS.md), so activation
 * must wait for venue-settled cash: the account stays PROVISIONING with NO
 * deposit posted, and the DEPOSIT posts exactly once at activation, no matter
 * how many pollers and sweeps race. The deterministic broker's holdFunding
 * hook simulates the settlement delay through the same port.
 */

async function newSession(email: string): Promise<SessionInfo> {
  const res = await getAuth().api.signUpEmail({
    body: { name: "T", email, password: "correct horse 9" },
  });
  return { userId: res.user.id, email, name: "T" };
}

function provisionRequest(startingCash: number): Request {
  return new Request("http://test/api/v1/account/provision", {
    method: "POST",
    body: JSON.stringify({ startingCash }),
  });
}

async function depositCount(accountId: string): Promise<number> {
  const rows = await getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.accountId, accountId));
  return rows.filter((r) => r.entryType === "DEPOSIT").length;
}

describe("async account provisioning", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
  });
  afterAll(closeDb);

  it("stays PROVISIONING with no deposit until venue funding settles, then activates exactly once", async () => {
    const session = await newSession("pend@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdFunding(true);

    const created = (await provisionAccount(provisionRequest(10_000), session)) as {
      account: { id: string; status: string; cash: string };
    };
    expect(created.account.status).toBe("PROVISIONING");
    expect(created.account.cash).toBe("0.00");
    expect(await depositCount(created.account.id)).toBe(0);

    // Poll (getMe) and sweep (worker) both run while funding is unsettled: no-ops.
    const meBefore = (await getMe(session)) as { account: { status: string } };
    expect(meBefore.account.status).toBe("PROVISIONING");
    const sweepBefore = await c.accountService.activatePendingAccounts();
    expect(sweepBefore).toEqual({ checked: 1, activated: 0 });
    expect(await depositCount(created.account.id)).toBe(0);

    // The ACH lands. The next poll activates and posts the opening DEPOSIT.
    c.deterministicBroker!.releaseFunding(`det-acct-${created.account.id}`);
    const meAfter = (await getMe(session)) as { account: { status: string; cash: string } };
    expect(meAfter.account.status).toBe("ACTIVE");
    expect(meAfter.account.cash).toBe("10000.00");
    expect(await depositCount(created.account.id)).toBe(1);

    // Replays cannot double-post (invariant 6): sweep + repeat poll are no-ops.
    await c.accountService.activatePendingAccounts();
    await getMe(session);
    expect(await depositCount(created.account.id)).toBe(1);
    const cash = await getDb()
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, created.account.id));
    expect(cash[0]!.cashBalance).toBe("10000.00");
  });

  it("the worker sweep activates settled accounts for users who are not polling", async () => {
    const session = await newSession("sweep@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdFunding(true);
    const created = (await provisionAccount(provisionRequest(5_000), session)) as {
      account: { id: string };
    };

    c.deterministicBroker!.releaseFunding(`det-acct-${created.account.id}`);
    const sweep = await c.accountService.activatePendingAccounts();
    expect(sweep).toEqual({ checked: 1, activated: 1 });
    expect(await depositCount(created.account.id)).toBe(1);
  });

  it("rejects starting cash outside the configured bounds (no account row created)", async () => {
    const session = await newSession("bounds@example.com");
    await expect(provisionAccount(provisionRequest(999), session)).rejects.toMatchObject({
      code: "VALIDATION",
      subcode: "INVALID_STARTING_CASH",
    });
    await expect(provisionAccount(provisionRequest(26_000), session)).rejects.toMatchObject({
      code: "VALIDATION",
      subcode: "INVALID_STARTING_CASH",
    });
    const me = (await getMe(session)) as { account: unknown };
    expect(me.account).toBeNull();
  });

  it("refuses a second account while one is open, including the double-submit race", async () => {
    const session = await newSession("dup@example.com");
    await provisionAccount(provisionRequest(10_000), session);
    await expect(provisionAccount(provisionRequest(10_000), session)).rejects.toMatchObject({
      code: "CONFLICT",
      subcode: "ACCOUNT_EXISTS",
    });

    // Double-submit race on a fresh user: exactly one wins; the loser maps the
    // unique-index violation (one OPEN account per user) to CONFLICT.
    const racer = await newSession("race@example.com");
    const results = await Promise.allSettled([
      provisionAccount(provisionRequest(10_000), racer),
      provisionAccount(provisionRequest(10_000), racer),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
  });

  it("getMe surfaces the onboarding bounds for the slider", async () => {
    const session = await newSession("slider@example.com");
    const me = (await getMe(session)) as {
      account: unknown;
      onboarding: { minStartingCash: number; maxStartingCash: number; defaultStartingCash: number };
    };
    expect(me.account).toBeNull();
    expect(me.onboarding.minStartingCash).toBeLessThan(me.onboarding.maxStartingCash);
    expect(me.onboarding.defaultStartingCash).toBeGreaterThanOrEqual(me.onboarding.minStartingCash);
    expect(me.onboarding.defaultStartingCash).toBeLessThanOrEqual(me.onboarding.maxStartingCash);
  });
});
