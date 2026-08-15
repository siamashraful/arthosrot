import { z } from "zod";
import { AppError, systemClock } from "@/core/shared";
import { ledgerRepository } from "@/infra/db/repositories/ledger";
import { watchlistsRepository } from "@/infra/db/repositories/watchlists";
import { pgTransactionRunner } from "@/infra/db/tx";
import type { SessionInfo } from "../session";
import { getContainer } from "../container";
import { serializeQuote } from "./market";
import { serializeOrder } from "./orders";

async function requireActiveAccount(session: SessionInfo) {
  const account = await getContainer().accountService.getActiveForUser(session.userId);
  if (!account) {
    throw new AppError("DOMAIN_RULE", "No active trading account", {
      subcode: "ACCOUNT_NOT_ACTIVE",
    });
  }
  return account;
}

export async function getMe(session: SessionInfo): Promise<unknown> {
  const account = await getContainer().accountService.getActiveForUser(session.userId);
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
  };
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

const addWatchlistSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z.\-]+$/),
});

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

/** Recent orders serialization is shared with /orders — re-export for dashboard use. */
export { serializeOrder };
