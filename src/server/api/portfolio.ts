import { z } from "zod";
import { Money } from "@/core/money";
import { equitySeries, resolveAllRange } from "@/core/portfolio";
import { AppError, systemClock } from "@/core/shared";
import { env } from "@/env";
import { fillsReplaySource } from "@/infra/db/repositories/fills";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { watchlistsRepository } from "@/infra/db/repositories/watchlists";
import { pgTransactionRunner } from "@/infra/db/tx";
import type { SessionInfo } from "../session";
import { getContainer } from "../container";
import { serializeQuote, symbolSchema } from "./market";

export async function requireActiveAccount(session: SessionInfo) {
  const account = await getContainer().accountService.getActiveForUser(session.userId);
  if (!account) {
    throw new AppError("DOMAIN_RULE", "No active trading account", {
      subcode: "ACCOUNT_NOT_ACTIVE",
    });
  }
  return account;
}

export async function getMe(session: SessionInfo): Promise<unknown> {
  const svc = getContainer().accountService;
  let account = await svc.getCurrentForUser(session.userId);
  // The user's own polling drives activation: venue funding settles minutes
  // after provisioning (async ACH), and this check is what flips the account
  // ACTIVE the moment the venue reports the cash. Idempotent + lock-guarded,
  // so concurrent polls / the worker sweep cannot double-post the DEPOSIT.
  if (account?.status === "PROVISIONING") {
    account = await svc.tryActivate(account.id);
  }
  const { STARTING_CASH_MIN, STARTING_CASH_MAX, STARTING_CASH_DEFAULT } = env();
  return {
    user: { id: session.userId, email: session.email, name: session.name },
    account: account
      ? {
          id: account.id,
          mode: account.mode,
          status: account.status,
          currency: account.currency,
          cash: account.cashBalance.toString(),
          startingCash: account.startingCash.toString(),
        }
      : null,
    onboarding: {
      minStartingCash: STARTING_CASH_MIN,
      maxStartingCash: STARTING_CASH_MAX,
      defaultStartingCash: STARTING_CASH_DEFAULT,
    },
  };
}

const provisionSchema = z.object({ startingCash: z.number().int() });

/**
 * Onboarding: create the paper account with the user's chosen starting cash
 * (slider, FR-2). May return status PROVISIONING — venue funding is
 * asynchronous and the DEPOSIT only posts at activation.
 */
export async function provisionAccount(request: Request, session: SessionInfo): Promise<unknown> {
  const { startingCash } = provisionSchema.parse(await request.json());
  const { STARTING_CASH_MIN, STARTING_CASH_MAX } = env();
  if (startingCash < STARTING_CASH_MIN || startingCash > STARTING_CASH_MAX) {
    throw new AppError(
      "VALIDATION",
      `Starting cash must be between $${STARTING_CASH_MIN.toLocaleString("en-US")} and $${STARTING_CASH_MAX.toLocaleString("en-US")}`,
      { subcode: "INVALID_STARTING_CASH" },
    );
  }

  const svc = getContainer().accountService;
  const current = await svc.getCurrentForUser(session.userId);
  if (current && current.status !== "PROVISIONING_FAILED") {
    throw new AppError("CONFLICT", "You already have an account", {
      subcode: "ACCOUNT_EXISTS",
    });
  }

  try {
    const account = await svc.openPaperAccount(
      session.userId,
      Money.fromString(`${startingCash}.00`),
    );
    return {
      account: {
        id: account.id,
        status: account.status,
        cash: account.cashBalance.toString(),
        startingCash: account.startingCash.toString(),
      },
    };
  } catch (err) {
    // Unique partial index (one OPEN account per user) catches the
    // double-submit race the check above cannot. Drizzle wraps the pg error,
    // so walk the cause chain for the unique-violation SQLSTATE.
    const isUniqueViolation = (e: unknown): boolean => {
      for (let cur = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
        if ((cur as { code?: unknown }).code === "23505") return true;
      }
      return false;
    };
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", "Account setup is already in progress", {
        subcode: "ACCOUNT_EXISTS",
      });
    }
    throw err;
  }
}

export async function getPortfolio(session: SessionInfo): Promise<unknown> {
  const account = await requireActiveAccount(session);
  const view = await getContainer().portfolioService.view(
    account.id,
    account.cashBalance,
    systemClock.now(),
  );
  const market = await getContainer().marketData.getMarketStatus();
  return { ...view, market: { status: market.status, asOf: market.asOf.toISOString() } };
}

export async function getLedger(request: Request, session: SessionInfo): Promise<unknown> {
  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  // Full history across ALL of the user's accounts — resets archive accounts
  // but their ledger stays visible here (invariant 14; Settings promises it).
  const entries = await pgTransactionRunner.run((tx) =>
    ledgerRepository.listForUser(tx, session.userId, 50, before),
  );
  return {
    entries: entries.map((e) => ({
      id: e.id,
      type: e.entryType,
      amount: e.amount.toString(),
      description: e.description,
      refType: e.refType,
      refId: e.refId,
      archived: e.accountArchived,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

const historySchema = z.object({ range: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]) });

/**
 * Net-worth series for the ACTIVE account (equity-series.ts owns the math
 * and the honesty rules). ALL maps to the smallest provider range covering
 * the account's age, then clips — echoed back as resolvedRange.
 */
export async function getPortfolioHistory(
  request: Request,
  session: SessionInfo,
): Promise<unknown> {
  const url = new URL(request.url);
  const { range } = historySchema.parse({ range: url.searchParams.get("range") ?? "1M" });
  const account = await requireActiveAccount(session);
  const c = getContainer();
  const now = systemClock.now();
  const resolvedRange = range === "ALL" ? resolveAllRange(account.createdAt, now) : range;

  const [fills, ledger] = await pgTransactionRunner.run((tx) =>
    Promise.all([
      fillsReplaySource.listForAccountChronological(tx, account.id),
      ledgerRepository.listForAccountAscending(tx, account.id),
    ]),
  );
  const view = await c.portfolioService.view(account.id, account.cashBalance, now);
  const series = await equitySeries({
    range: resolvedRange,
    fills,
    ledger,
    accountCreatedAt: account.createdAt,
    now,
    liveEquity: Money.fromString(view.summary.equity),
    getCandles: (symbol) => c.marketData.getCandles(symbol, resolvedRange),
  });

  return {
    range,
    resolvedRange,
    points: series.points.map((p) => ({
      t: p.t.toISOString(),
      value: p.value.toString(),
      netDeposits: p.netDeposits.toString(),
    })),
    change: { absolute: series.change.absolute.toString(), percent: series.change.percent },
    asOf: now.toISOString(),
  };
}

export async function getWatchlist(session: SessionInfo): Promise<unknown> {
  const items = await pgTransactionRunner.run(async (tx) => {
    const watchlistId = await watchlistsRepository.getOrCreateForUser(tx, session.userId);
    return watchlistsRepository.list(tx, watchlistId);
  });
  const quotes =
    items.length > 0
      ? await getContainer().marketData.getQuotes(items.map((i) => i.symbol))
      : new Map();
  return {
    items: items.map((i) => {
      const quote = quotes.get(i.symbol);
      return { ...i, quote: quote ? serializeQuote(quote) : null };
    }),
  };
}

const addWatchlistSchema = z.object({ symbol: symbolSchema });

export async function addWatchlistItem(request: Request, session: SessionInfo): Promise<unknown> {
  const { symbol } = addWatchlistSchema.parse(await request.json());
  const instrument = await getContainer().instrumentService.getOrRegister(symbol);
  await pgTransactionRunner.run(async (tx) => {
    const watchlistId = await watchlistsRepository.getOrCreateForUser(tx, session.userId);
    await watchlistsRepository.add(tx, watchlistId, instrument.id);
  });
  return getWatchlist(session);
}

export async function removeWatchlistItem(itemId: string, session: SessionInfo): Promise<unknown> {
  await pgTransactionRunner.run(async (tx) => {
    const watchlistId = await watchlistsRepository.getOrCreateForUser(tx, session.userId);
    await watchlistsRepository.remove(tx, watchlistId, itemId);
  });
  return getWatchlist(session);
}

const resetSchema = z.object({ confirm: z.literal("RESET") });

/**
 * Account reset — an explicit workflow that REFUSES to archive while any
 * order is unresolved (a cancel-vs-fill race must never land fills on an
 * archived account):
 *   1. request cancellation of every cancellable open order at the venue;
 *   2. await terminal outcomes (bounded wait — the venue may fill instead);
 *   3. on timeout, run reconciliation once to import missed outcomes;
 *   4. archive + re-provision ONLY when nothing remains open, else 409.
 */
export async function resetAccount(request: Request, session: SessionInfo): Promise<unknown> {
  resetSchema.parse(await request.json());
  const account = await requireActiveAccount(session);
  const c = getContainer();

  const listOpen = () =>
    pgTransactionRunner.run((tx) => c.ordersService.list(tx, account.id, true));

  for (const order of await listOpen()) {
    if (order.state === "PENDING_SUBMISSION" || order.state === "CANCEL_PENDING") continue;
    await pgTransactionRunner.run((tx) =>
      c.ordersService.requestCancel(tx, order.id, systemClock.now()),
    );
    await c.executionService.requestVenueCancel(order.id);
  }

  // Bounded wait for terminal venue outcomes (deterministic venue: immediate).
  let open = await listOpen();
  for (let attempt = 0; open.length > 0 && attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    open = await listOpen();
  }

  // Timeout path: reconcile once — imports outcomes the stream missed
  // (including fills that won the race and dangling submissions).
  if (open.length > 0) {
    await c.reconciliationService.reconcileAll();
    open = await listOpen();
  }

  if (open.length > 0) {
    throw new AppError(
      "CONFLICT",
      `Reset blocked: ${open.length} order(s) still unresolved at the venue — try again shortly`,
      { details: { orderIds: open.map((o) => o.id) } },
    );
  }

  const fresh = await c.accountService.archiveAndReprovision(session.userId);
  return {
    account: {
      id: fresh.id,
      status: fresh.status,
      cash: fresh.cashBalance.toString(),
    },
  };
}
