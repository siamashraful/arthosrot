import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Money, Px, Qty } from "@/core/money";
import { AppError } from "@/core/shared";
import { closeDb, getDb, schema } from "@/infra/db";
import { asTx } from "@/infra/db/tx";
import { getAuth } from "@/server/auth";
import { getContainer, resetContainerForTests } from "@/server/container";
import { getCash, requestTransfer } from "@/server/api/cash";
import { errorResponse } from "@/server/api/http";
import { getPortfolio, getPortfolioHistory, resetAccount } from "@/server/api/portfolio";
import type { SessionInfo } from "@/server/session";
import { signupWithAccount, truncateAll } from "./helpers";

/**
 * Paper cash transfers (ADR-015; FINANCIAL_INVARIANTS.md 16–20) against the
 * DeterministicPaperBroker. Default venue behaviour settles synchronously;
 * holdTransfers()/completeTransfer()/failTransfer() simulate the real
 * (asynchronous ACH) venue through the same port.
 */

/** The deterministic venue keys transfers by id only; the ref is unused there. */
const REF_ANY = { broker: "DETERMINISTIC" as const, externalAccountId: "-" };

interface CashBody {
  status: string;
  cash: string;
  reservedForOrders: string;
  pendingDeposits: string;
  pendingWithdrawals: string;
  withdrawable: string;
  limits: { minAmount: string; maxPerTransfer: string; depositRemainingToday: string };
  transfers: Array<{
    id: string;
    direction: string;
    amount: string;
    state: string;
    createdAt: string;
    settledAt: string | null;
    failureReason: string | null;
  }>;
}
interface TransferBody {
  transfer: CashBody["transfers"][number];
  cash: CashBody;
}

async function userWithAccount(email: string, startingCash = "10000.00") {
  const { userId, account } = await signupWithAccount(email, startingCash);
  expect(account.status).toBe("ACTIVE");
  const session: SessionInfo = { userId, email, name: "T" };
  return { session, account };
}

function transferRequest(body: unknown, key: string | null = crypto.randomUUID()): Request {
  return new Request("http://test.local/api/v1/account/transfers", {
    method: "POST",
    headers: key ? { "idempotency-key": key } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function transfer(
  session: SessionInfo,
  direction: "DEPOSIT" | "WITHDRAWAL",
  amount: string,
  key: string = crypto.randomUUID(),
) {
  const res = await requestTransfer(transferRequest({ direction, amount }, key), session);
  return { status: res.status, body: res.body as TransferBody };
}

async function cash(session: SessionInfo): Promise<CashBody> {
  return (await getCash(session)) as CashBody;
}

async function restingLimitBuy(userId: string, qty: number, limit: string, key?: string) {
  const c = getContainer();
  const account = (await c.accountService.getActiveForUser(userId))!;
  const instrument = await c.instrumentService.getOrRegister("AAPL");
  const placed = await c.ordersService.place({
    account,
    instrument,
    side: "BUY",
    type: "LIMIT",
    qty: Qty.of(qty),
    limitPrice: Px.fromString(limit),
    refPrice: null,
    idempotencyKey: key ?? crypto.randomUUID(),
  });
  if (!placed.replayed) await c.executionService.submit(placed.order.id);
  return placed.order;
}

async function ledgerFor(accountId: string) {
  return getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.accountId, accountId))
    .orderBy(schema.ledgerEntries.createdAt);
}

async function transferRow(id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.cashTransfers)
    .where(eq(schema.cashTransfers.id, id));
  return row!;
}

async function inBalance(accountId: string): Promise<boolean> {
  const rec = await getDb().transaction((tx) =>
    getContainer().ledgerService.reconcile(asTx(tx), accountId),
  );
  return rec.inBalance;
}

/** Make a PENDING transfer look old enough for the sweep's grace window. */
async function age(transferId: string, minutes: number) {
  await getDb()
    .update(schema.cashTransfers)
    .set({ createdAt: sql`now() - make_interval(mins => ${minutes})` })
    .where(eq(schema.cashTransfers.id, transferId));
}

function rejection(err: unknown) {
  expect(err).toBeInstanceOf(AppError);
  const e = err as AppError;
  return { code: e.code, subcode: e.subcode, status: e.httpStatus };
}

describe("paper cash transfers", () => {
  beforeEach(async () => {
    await truncateAll();
    resetContainerForTests();
    getContainer().fixtureProvider!.setMarketStatus("OPEN");
    getContainer().fixtureProvider!.setPrice("AAPL", "200.0000");
  });
  afterAll(closeDb);

  it("deposit settles synchronously at the deterministic venue and posts one DEPOSIT", async () => {
    const { session, account } = await userWithAccount("dep@example.com");
    const { status, body } = await transfer(session, "DEPOSIT", "500.00");
    expect(status).toBe(201);
    expect(body.transfer).toMatchObject({
      direction: "DEPOSIT",
      amount: "500.00",
      state: "SETTLED",
      failureReason: null,
    });
    expect(body.transfer.settledAt).not.toBeNull();
    expect(body.cash).toMatchObject({
      status: "ACTIVE",
      cash: "10500.00",
      reservedForOrders: "0.00",
      pendingDeposits: "0.00",
      pendingWithdrawals: "0.00",
      withdrawable: "10500.00",
      // opening 10000 + 500 count toward the venue's 50k/24h cap
      limits: { minAmount: "1.00", maxPerTransfer: "50000.00", depositRemainingToday: "39500.00" },
    });

    const deposits = (await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER");
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({
      entryType: "DEPOSIT",
      amount: "500.00",
      refId: body.transfer.id,
      description: "Deposit (simulated)",
    });
    expect(await inBalance(account.id)).toBe(true);

    const summary = await cash(session);
    expect(summary.transfers.map((t) => t.id)).toEqual([body.transfer.id]);
  });

  it("a pending deposit raises neither cash nor buying power until the venue settles it", async () => {
    const { session, account } = await userWithAccount("pend-dep@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);

    const { status, body } = await transfer(session, "DEPOSIT", "750.00");
    expect(status).toBe(201);
    expect(body.transfer.state).toBe("PENDING");
    expect(body.cash).toMatchObject({ cash: "10000.00", pendingDeposits: "750.00" });
    expect(body.cash.limits.depositRemainingToday).toBe("39250.00"); // pending counts
    const portfolio = (await getPortfolio(session)) as { summary: { buyingPower: string } };
    expect(portfolio.summary.buyingPower).toBe("10000.00");
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      0,
    );

    // Polling before the venue settles is a no-op.
    expect((await cash(session)).transfers[0]!.state).toBe("PENDING");

    // The ACH lands; the next GET settles it.
    const row = await transferRow(body.transfer.id);
    c.deterministicBroker!.completeTransfer(row.venueTransferId!);
    const after = await cash(session);
    expect(after).toMatchObject({ cash: "10750.00", pendingDeposits: "0.00" });
    expect(after.transfers[0]!.state).toBe("SETTLED");
    expect(await inBalance(account.id)).toBe(true);
  });

  it("a withdrawal HOLDS its amount while pending (withdrawable + buying power), then posts a negative WITHDRAWAL", async () => {
    const { session, account } = await userWithAccount("wd@example.com");
    const c = getContainer();
    await restingLimitBuy(session.userId, 10, "100.0000"); // reserves 1000.00, rests (price 200)
    c.deterministicBroker!.holdTransfers(true);

    const { body } = await transfer(session, "WITHDRAWAL", "3000.00");
    expect(body.transfer.state).toBe("PENDING");
    expect(body.cash).toMatchObject({
      cash: "10000.00",
      reservedForOrders: "1000.00",
      pendingWithdrawals: "3000.00",
      withdrawable: "6000.00",
    });
    const portfolio = (await getPortfolio(session)) as { summary: { buyingPower: string } };
    expect(portfolio.summary.buyingPower).toBe("6000.00");

    // Placement respects the hold: 6000.01 of reservation is refused, 6000.00 fits.
    await expect(restingLimitBuy(session.userId, 1, "6000.0100")).rejects.toMatchObject({
      code: "DOMAIN_RULE",
      subcode: "INSUFFICIENT_BUYING_POWER",
    });

    const row = await transferRow(body.transfer.id);
    c.deterministicBroker!.completeTransfer(row.venueTransferId!);
    const after = await cash(session);
    expect(after).toMatchObject({
      cash: "7000.00",
      reservedForOrders: "1000.00",
      pendingWithdrawals: "0.00",
      withdrawable: "6000.00",
    });
    const wd = (await ledgerFor(account.id)).filter((e) => e.entryType === "WITHDRAWAL");
    expect(wd).toHaveLength(1);
    expect(wd[0]).toMatchObject({
      amount: "-3000.00",
      refType: "CASH_TRANSFER",
      refId: body.transfer.id,
      description: "Withdrawal (simulated)",
    });
    expect(await inBalance(account.id)).toBe(true);
  });

  it("withdrawable excludes open BUY reservations: one cent over is refused, no row created", async () => {
    const { session, account } = await userWithAccount("insuff@example.com");
    await restingLimitBuy(session.userId, 10, "102.5000"); // reserves 1025.00
    const summary = await cash(session);
    expect(summary.withdrawable).toBe("8975.00");

    const err = await transfer(session, "WITHDRAWAL", "8975.01").catch((e: unknown) => e);
    expect(rejection(err)).toEqual({
      code: "DOMAIN_RULE",
      subcode: "INSUFFICIENT_WITHDRAWABLE",
      status: 422,
    });
    const rows = await getDb()
      .select()
      .from(schema.cashTransfers)
      .where(eq(schema.cashTransfers.accountId, account.id));
    expect(rows).toHaveLength(0);

    const ok = await transfer(session, "WITHDRAWAL", "8975.00");
    expect(ok.body.transfer.state).toBe("SETTLED");
    expect(ok.body.cash).toMatchObject({ cash: "1025.00", withdrawable: "0.00" });
  });

  it("a racing withdrawal and buy can never jointly exceed cash (account lock)", async () => {
    const { session, account } = await userWithAccount("race-wb@example.com");
    getContainer().deterministicBroker!.holdTransfers(true); // keep the hold visible
    const results = await Promise.allSettled([
      transfer(session, "WITHDRAWAL", "6000.00"),
      restingLimitBuy(session.userId, 40, "150.0000"), // reserves 6000.00
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["INSUFFICIENT_WITHDRAWABLE", "INSUFFICIENT_BUYING_POWER"]).toContain(
      (failed.reason as AppError).subcode,
    );
    const s = await cash(session);
    const committed = Money.fromString(s.reservedForOrders).add(
      Money.fromString(s.pendingWithdrawals),
    );
    expect(committed.compare(Money.fromString(s.cash))).toBeLessThanOrEqual(0);
    expect(await inBalance(account.id)).toBe(true);
  });

  it("two racing withdrawals can never jointly exceed withdrawable", async () => {
    const { session } = await userWithAccount("race-ww@example.com");
    getContainer().deterministicBroker!.holdTransfers(true);
    const results = await Promise.allSettled([
      transfer(session, "WITHDRAWAL", "6000.00"),
      transfer(session, "WITHDRAWAL", "6000.00"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as AppError).subcode).toBe("INSUFFICIENT_WITHDRAWABLE");
    expect((await cash(session)).withdrawable).toBe("4000.00");
  });

  it("idempotent replay returns the original (200); a different body with the same key is 409", async () => {
    const { session, account } = await userWithAccount("idem@example.com");
    const key = crypto.randomUUID();
    const first = await transfer(session, "DEPOSIT", "500.00", key);
    expect(first.status).toBe(201);

    const replay = await transfer(session, "DEPOSIT", "500.00", key);
    expect(replay.status).toBe(200);
    expect(replay.body.transfer.id).toBe(first.body.transfer.id);
    // canonical amount: "500" is the same request as "500.00"
    const canonical = await transfer(session, "DEPOSIT", "500", key);
    expect(canonical.status).toBe(200);
    expect(canonical.body.transfer.id).toBe(first.body.transfer.id);

    for (const [direction, amount] of [
      ["DEPOSIT", "500.01"],
      ["WITHDRAWAL", "500.00"],
    ] as const) {
      const err = await transfer(session, direction, amount, key).catch((e: unknown) => e);
      expect(rejection(err)).toEqual({
        code: "CONFLICT",
        subcode: "IDEMPOTENCY_CONFLICT",
        status: 409,
      });
    }
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      1,
    );

    // concurrent same-key submissions: one transfer, one ledger entry
    const key2 = crypto.randomUUID();
    const racers = await Promise.all([
      transfer(session, "DEPOSIT", "100.00", key2),
      transfer(session, "DEPOSIT", "100.00", key2),
    ]);
    expect(new Set(racers.map((r) => r.body.transfer.id)).size).toBe(1);
    expect(racers.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      2,
    );
  });

  it("settling twice posts once: concurrent GET polls + worker sweeps, and the DB backstop", async () => {
    const { session, account } = await userWithAccount("twice@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const { body } = await transfer(session, "DEPOSIT", "250.00");
    const row = await transferRow(body.transfer.id);
    c.deterministicBroker!.completeTransfer(row.venueTransferId!);

    await Promise.all([
      cash(session),
      cash(session),
      c.cashTransferService.sweepPending(),
      c.cashTransferService.sweepPending(),
      c.cashTransferService.syncPending(account.id),
    ]);
    await c.cashTransferService.sweepPending();
    const entries = (await ledgerFor(account.id)).filter((e) => e.refId === body.transfer.id);
    expect(entries).toHaveLength(1);
    expect((await cash(session)).cash).toBe("10250.00");

    // Structural backstop: a second ledger row for the same transfer is refused.
    await expect(
      getDb().insert(schema.ledgerEntries).values({
        accountId: account.id,
        entryType: "DEPOSIT",
        amount: "250.00",
        refType: "CASH_TRANSFER",
        refId: body.transfer.id,
        description: "Deposit (simulated)",
      }),
    ).rejects.toThrow();
  });

  it("a FAILED withdrawal releases its hold and posts nothing", async () => {
    const { session, account } = await userWithAccount("fail@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const { body } = await transfer(session, "WITHDRAWAL", "3000.00");
    expect((await cash(session)).withdrawable).toBe("7000.00");

    const row = await transferRow(body.transfer.id);
    c.deterministicBroker!.failTransfer(row.venueTransferId!, "R01 insufficient funds");
    const sweep = await c.cashTransferService.sweepPending();
    expect(sweep).toMatchObject({ accountsChecked: 1, transfersChecked: 1, failed: 1, errors: 0 });

    const after = await cash(session);
    expect(after).toMatchObject({
      cash: "10000.00",
      pendingWithdrawals: "0.00",
      withdrawable: "10000.00",
    });
    expect(after.transfers[0]).toMatchObject({
      state: "FAILED",
      failureReason: "R01 insufficient funds",
      settledAt: null,
    });
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      0,
    );
    // terminal: a later venue "completion" cannot resurrect it
    c.deterministicBroker!.completeTransfer(row.venueTransferId!);
    await c.cashTransferService.sweepPending();
    expect((await transferRow(body.transfer.id)).state).toBe("FAILED");
  });

  it("a definitive venue rejection at initiate returns 201 FAILED (hold released)", async () => {
    const { session } = await userWithAccount("reject@example.com");
    getContainer().deterministicBroker!.failNextTransfer("reject");
    const { status, body } = await transfer(session, "WITHDRAWAL", "100.00");
    expect(status).toBe(201);
    expect(body.transfer).toMatchObject({ state: "FAILED" });
    expect(body.transfer.failureReason).toMatch(/simulated venue rejection/);
    expect(body.cash.withdrawable).toBe("10000.00");
  });

  it("an ambiguous initiate (timeout) stays PENDING and holding; the sweep fails it only after the grace window", async () => {
    const { session, account } = await userWithAccount("timeout@example.com");
    const c = getContainer();
    c.deterministicBroker!.failNextTransfer("timeout");
    const { status, body } = await transfer(session, "WITHDRAWAL", "400.00");
    expect(status).toBe(201);
    expect(body.transfer.state).toBe("PENDING");
    expect(body.cash.withdrawable).toBe("9600.00");
    expect((await transferRow(body.transfer.id)).venueTransferId).toBeNull();

    await c.cashTransferService.sweepPending(); // inside grace: untouched
    expect((await transferRow(body.transfer.id)).state).toBe("PENDING");

    await age(body.transfer.id, 20);
    await c.cashTransferService.sweepPending(); // venue has nothing matching
    const row = await transferRow(body.transfer.id);
    expect(row.state).toBe("FAILED");
    expect(row.failureReason).toMatch(/never reached the venue/);
    expect((await cash(session)).withdrawable).toBe("10000.00");
    expect(await inBalance(account.id)).toBe(true);
  });

  it("a lost venue id is recovered from the venue's transfer list and settles (no double-count)", async () => {
    const { session, account } = await userWithAccount("recover@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const { body } = await transfer(session, "WITHDRAWAL", "1200.00");
    const venueId = (await transferRow(body.transfer.id)).venueTransferId!;
    // Simulate a crash between the venue call and recording its id.
    await getDb()
      .update(schema.cashTransfers)
      .set({ venueTransferId: null })
      .where(eq(schema.cashTransfers.id, body.transfer.id));
    await age(body.transfer.id, 20);
    c.deterministicBroker!.backdateTransfer(venueId, 20 * 60_000); // same moment at the venue
    c.deterministicBroker!.completeTransfer(venueId);

    await c.cashTransferService.sweepPending();
    const row = await transferRow(body.transfer.id);
    expect(row).toMatchObject({ state: "SETTLED", venueTransferId: venueId });
    expect((await cash(session)).cash).toBe("8800.00");
    expect(await inBalance(account.id)).toBe(true);
  });

  it("recovery never steals a newer in-flight request's venue transfer (time window)", async () => {
    const { session, account } = await userWithAccount("steal@example.com");
    const c = getContainer();
    const broker = c.deterministicBroker!;
    // T1: the venue never saw it (timeout before the venue), now past grace.
    broker.failNextTransfer("timeout");
    const lost = await transfer(session, "WITHDRAWAL", "500.00");
    await age(lost.body.transfer.id, 20);
    // T2: same direction + amount, just created, its venue id not recorded
    // yet (initiate still in flight from the row's point of view).
    broker.holdTransfers(true);
    const live = await transfer(session, "WITHDRAWAL", "500.00");
    const liveVenueId = (await transferRow(live.body.transfer.id)).venueTransferId!;
    await getDb()
      .update(schema.cashTransfers)
      .set({ venueTransferId: null })
      .where(eq(schema.cashTransfers.id, live.body.transfer.id));

    await c.cashTransferService.sweepPending();
    const t1 = await transferRow(lost.body.transfer.id);
    expect(t1).toMatchObject({ state: "FAILED", venueTransferId: null });
    expect(t1.failureReason).toMatch(/never reached the venue/);
    expect((await transferRow(live.body.transfer.id)).state).toBe("PENDING"); // inside grace

    // T2 is then recovered as its own (closest-in-time) venue transfer.
    await age(live.body.transfer.id, 20);
    broker.backdateTransfer(liveVenueId, 20 * 60_000);
    broker.completeTransfer(liveVenueId);
    await c.cashTransferService.sweepPending();
    expect(await transferRow(live.body.transfer.id)).toMatchObject({
      state: "SETTLED",
      venueTransferId: liveVenueId,
    });
    expect((await cash(session)).cash).toBe("9500.00");
    expect(await inBalance(account.id)).toBe(true);
  });

  it("an unreadable venue listing never FAILS a lost transfer — it stays PENDING and holding", async () => {
    const { session } = await userWithAccount("incomplete@example.com");
    const c = getContainer();
    c.deterministicBroker!.failNextTransfer("timeout");
    const { body } = await transfer(session, "WITHDRAWAL", "700.00");
    await age(body.transfer.id, 20);

    c.deterministicBroker!.incompleteListings(true);
    await c.cashTransferService.sweepPending();
    expect((await transferRow(body.transfer.id)).state).toBe("PENDING");
    expect((await cash(session)).withdrawable).toBe("9300.00"); // hold kept

    c.deterministicBroker!.incompleteListings(false); // the venue reads cleanly again
    await c.cashTransferService.sweepPending();
    expect((await transferRow(body.transfer.id)).state).toBe("FAILED");
  });

  it("GET /account/cash reads the venue ONCE per poll, not once per pending transfer", async () => {
    const { session } = await userWithAccount("polls@example.com");
    const broker = getContainer().deterministicBroker!;
    broker.holdTransfers(true);
    for (const amount of ["10.00", "20.00", "30.00"]) await transfer(session, "DEPOSIT", amount);
    const list = vi.spyOn(broker, "listTransfers");
    const byId = vi.spyOn(broker, "getTransfer");
    const body = await cash(session);
    expect(body.pendingDeposits).toBe("60.00");
    expect(list).toHaveBeenCalledTimes(1);
    expect(byId).not.toHaveBeenCalled();
    list.mockRestore();
    byId.mockRestore();
  });

  it("a transfer the venue has no record of fails after the grace window (venue restart)", async () => {
    const { session } = await userWithAccount("forgot@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const { body } = await transfer(session, "DEPOSIT", "300.00");
    c.deterministicBroker!.forgetTransfers();
    await c.cashTransferService.sweepPending();
    expect((await transferRow(body.transfer.id)).state).toBe("PENDING"); // grace
    await age(body.transfer.id, 20);
    await c.cashTransferService.sweepPending();
    const row = await transferRow(body.transfer.id);
    expect(row.state).toBe("FAILED");
    expect(row.failureReason).toMatch(/no record/);
    expect((await cash(session)).cash).toBe("10000.00");
  });

  it("account reset CANCELS pending transfers (no orphaned holds); the new account starts clean", async () => {
    const { session, account } = await userWithAccount("reset@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const wd = await transfer(session, "WITHDRAWAL", "2000.00");
    const dep = await transfer(session, "DEPOSIT", "500.00");
    const wdVenue = (await transferRow(wd.body.transfer.id)).venueTransferId!;
    const depVenue = (await transferRow(dep.body.transfer.id)).venueTransferId!;

    const reset = (await resetAccount(
      new Request("http://test.local/api/v1/account/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
      session,
    )) as { account: { id: string } };
    expect(reset.account.id).not.toBe(account.id);

    for (const id of [wd.body.transfer.id, dep.body.transfer.id]) {
      const row = await transferRow(id);
      expect(row.state).toBe("CANCELED");
      expect(row.failureReason).toMatch(/reset/);
    }
    const fresh = await cash(session);
    expect(fresh).toMatchObject({
      cash: "10000.00",
      pendingDeposits: "0.00",
      pendingWithdrawals: "0.00",
      withdrawable: "10000.00",
      transfers: [],
    });

    // The venue completing them later changes nothing on either account.
    c.deterministicBroker!.completeTransfer(wdVenue);
    c.deterministicBroker!.completeTransfer(depVenue);
    await c.cashTransferService.sweepPending();
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      0,
    );
    expect(await inBalance(account.id)).toBe(true);
  });

  it("reset asks the venue to cancel in-flight transfers; the sweep confirms them", async () => {
    const { session } = await userWithAccount("venuecancel@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    const wd = await transfer(session, "WITHDRAWAL", "250.00");
    const venueId = (await transferRow(wd.body.transfer.id)).venueTransferId!;
    await resetAccount(
      new Request("http://test.local/api/v1/account/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
      session,
    );
    expect(await c.deterministicBroker!.getTransfer(REF_ANY, venueId)).toMatchObject({
      state: "FAILED",
    });
    await c.cashTransferService.sweepPending();
    const row = await transferRow(wd.body.transfer.id);
    expect(row.state).toBe("CANCELED");
    expect(row.failureReason).toMatch(/reset.*venue confirmed/);
  });

  it("a reset-canceled transfer the venue settles anyway is flagged loudly, never posted silently", async () => {
    const { session, account } = await userWithAccount("diverge@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    c.deterministicBroker!.refuseTransferCancels(true); // the ACH already left
    const wd = await transfer(session, "WITHDRAWAL", "250.00");
    const venueId = (await transferRow(wd.body.transfer.id)).venueTransferId!;
    await resetAccount(
      new Request("http://test.local/api/v1/account/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
      session,
    );
    c.deterministicBroker!.completeTransfer(venueId);

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const first = await c.cashTransferService.sweepPending();
    expect(first.divergedAfterReset).toBe(1);
    expect(errors.mock.calls.map((a) => String(a[0])).join("\n")).toMatch(
      new RegExp(`operator ADJUSTMENT.*${wd.body.transfer.id}`),
    );
    errors.mockRestore();
    const row = await transferRow(wd.body.transfer.id);
    expect(row.state).toBe("CANCELED");
    expect(row.failureReason).toMatch(/venue settled it anyway/);
    // no money moved locally without an operator; flagged once, not every pass
    expect((await ledgerFor(account.id)).filter((e) => e.refType === "CASH_TRANSFER")).toHaveLength(
      0,
    );
    expect((await c.cashTransferService.sweepPending()).divergedAfterReset).toBe(0);
  });

  it("net deposits on the equity series subtract settled withdrawals", async () => {
    const { session } = await userWithAccount("equity@example.com");
    await transfer(session, "DEPOSIT", "500.00");
    await transfer(session, "WITHDRAWAL", "2000.00");
    const history = (await getPortfolioHistory(
      new Request("http://test.local/api/v1/portfolio/history?range=1D"),
      session,
    )) as { points: Array<{ value: string; netDeposits: string }> };
    const last = history.points.at(-1)!;
    expect(last.netDeposits).toBe("8500.00");
    expect(last.value).toBe("8500.00");
  });

  it("reconciliation stays HEALTHY with transfers in flight (pending posts nothing)", async () => {
    const { session, account } = await userWithAccount("recon@example.com");
    const c = getContainer();
    c.deterministicBroker!.holdTransfers(true);
    await transfer(session, "DEPOSIT", "900.00");
    await transfer(session, "WITHDRAWAL", "700.00");
    const result = await c.reconciliationService.reconcileAll();
    expect(result.driftDetected).toEqual([]);
    const [row] = await getDb()
      .select()
      .from(schema.brokerAccounts)
      .where(eq(schema.brokerAccounts.tradingAccountId, account.id));
    expect(row!.reconciliationStatus).toBe("HEALTHY");
  });

  describe("validation and rule errors", () => {
    it("malformed amounts are VALIDATION (422) with no row created", async () => {
      const { session, account } = await userWithAccount("val@example.com");
      for (const amount of ["abc", "1.234", "-5.00", "0.00", "", "1e3"]) {
        const err = await transfer(session, "DEPOSIT", amount).catch((e: unknown) => e);
        expect(rejection(err)).toMatchObject({ code: "VALIDATION", status: 422 });
      }
      // a JSON number is not a money string
      const numeric = await requestTransfer(
        transferRequest({ direction: "DEPOSIT", amount: 500 }),
        session,
      ).catch((e: unknown) => e);
      expect(errorResponse(numeric, "rid").status).toBe(422);
      const badDirection = await requestTransfer(
        transferRequest({ direction: "SIDEWAYS", amount: "5.00" }),
        session,
      ).catch((e: unknown) => e);
      expect(errorResponse(badDirection, "rid").status).toBe(422);
      const notJson = await requestTransfer(transferRequest("{nope"), session).catch(
        (e: unknown) => e,
      );
      expect(rejection(notJson).code).toBe("VALIDATION");
      const rows = await getDb()
        .select()
        .from(schema.cashTransfers)
        .where(eq(schema.cashTransfers.accountId, account.id));
      expect(rows).toHaveLength(0);
    });

    it("the Idempotency-Key header is required and must be a UUID", async () => {
      const { session } = await userWithAccount("key@example.com");
      for (const key of [null, "not-a-uuid"]) {
        const err = await requestTransfer(
          transferRequest({ direction: "DEPOSIT", amount: "5.00" }, key),
          session,
        ).catch((e: unknown) => e);
        expect(rejection(err)).toMatchObject({ code: "VALIDATION", status: 422 });
      }
    });

    it("size limits and the trailing-24h deposit cap (pending + opening deposit included)", async () => {
      const { session } = await userWithAccount("limits@example.com");
      const tooSmall = await transfer(session, "DEPOSIT", "0.99").catch((e: unknown) => e);
      expect(rejection(tooSmall)).toEqual({
        code: "DOMAIN_RULE",
        subcode: "AMOUNT_TOO_SMALL",
        status: 422,
      });
      const tooLarge = await transfer(session, "WITHDRAWAL", "50000.01").catch((e: unknown) => e);
      expect(rejection(tooLarge).subcode).toBe("AMOUNT_TOO_LARGE");

      getContainer().deterministicBroker!.holdTransfers(true);
      await transfer(session, "DEPOSIT", "39999.00"); // pending; opening 10000 + 39999
      expect((await cash(session)).limits.depositRemainingToday).toBe("1.00");
      const over = await transfer(session, "DEPOSIT", "1.01").catch((e: unknown) => e);
      expect(rejection(over)).toEqual({
        code: "DOMAIN_RULE",
        subcode: "DEPOSIT_LIMIT",
        status: 422,
      });
      expect((await transfer(session, "DEPOSIT", "1.00")).status).toBe(201);
    });

    it("a failed deposit frees its share of the daily cap", async () => {
      const { session } = await userWithAccount("capfree@example.com");
      getContainer().deterministicBroker!.failNextTransfer("reject");
      await transfer(session, "DEPOSIT", "40000.00");
      expect((await cash(session)).limits.depositRemainingToday).toBe("40000.00");
    });

    it("no account: 404 NO_ACCOUNT on both endpoints", async () => {
      const res = await getAuth().api.signUpEmail({
        body: { name: "T", email: "none@example.com", password: "correct horse 9" },
      });
      const session: SessionInfo = { userId: res.user.id, email: "none@example.com", name: "T" };
      for (const call of [() => getCash(session), () => transfer(session, "DEPOSIT", "5.00")]) {
        const err = await call().catch((e: unknown) => e);
        expect(rejection(err)).toEqual({ code: "NOT_FOUND", subcode: "NO_ACCOUNT", status: 404 });
      }
    });

    it("an account that is not ACTIVE refuses transfers (ACCOUNT_NOT_ACTIVE); GET still renders", async () => {
      const res = await getAuth().api.signUpEmail({
        body: { name: "T", email: "prov@example.com", password: "correct horse 9" },
      });
      const session: SessionInfo = { userId: res.user.id, email: "prov@example.com", name: "T" };
      const c = getContainer();
      c.deterministicBroker!.holdFunding(true);
      await c.accountService.openPaperAccount(res.user.id, Money.fromString("5000.00"));

      const summary = await cash(session);
      expect(summary).toMatchObject({ status: "PROVISIONING", cash: "0.00", withdrawable: "0.00" });
      const err = await transfer(session, "DEPOSIT", "5.00").catch((e: unknown) => e);
      expect(rejection(err)).toEqual({
        code: "DOMAIN_RULE",
        subcode: "ACCOUNT_NOT_ACTIVE",
        status: 422,
      });
    });

    it("transfers are scoped to the session's current account", async () => {
      const a = await userWithAccount("scope-a@example.com");
      const b = await userWithAccount("scope-b@example.com");
      await transfer(a.session, "DEPOSIT", "10.00");
      expect((await cash(b.session)).transfers).toEqual([]);
      const rows = await getDb()
        .select()
        .from(schema.cashTransfers)
        .where(
          and(
            eq(schema.cashTransfers.accountId, b.account.id),
            eq(schema.cashTransfers.state, "SETTLED"),
          ),
        );
      expect(rows).toHaveLength(0);
    });
  });
});
