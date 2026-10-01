import { z } from "zod";
import { parseTransferAmount, type CashSummary, type CashTransfer } from "@/core/cash-transfers";
import { AppError } from "@/core/shared";
import type { SessionInfo } from "../session";
import { getContainer } from "../container";
import { readJson } from "./http";
import { enforceRateLimit } from "./rate-limit";

/**
 * Paper-account cash: GET /api/v1/account/cash and POST
 * /api/v1/account/transfers (ADR-015). Paper-only by construction — the
 * transfers move simulated cash at the paper venue; the live-mode preview's
 * funding sheets never reach this (ADR-011).
 */

export function serializeTransfer(t: CashTransfer) {
  return {
    id: t.id,
    direction: t.direction,
    amount: t.amount.toString(),
    state: t.state,
    createdAt: t.createdAt.toISOString(),
    settledAt: t.settledAt?.toISOString() ?? null,
    failureReason: t.failureReason,
  };
}

function serializeSummary(s: CashSummary) {
  return {
    status: s.status,
    cash: s.cash.toString(),
    reservedForOrders: s.reservedForOrders.toString(),
    pendingDeposits: s.pendingDeposits.toString(),
    pendingWithdrawals: s.pendingWithdrawals.toString(),
    withdrawable: s.withdrawable.toString(),
    limits: {
      minAmount: s.limits.minAmount.toString(),
      maxPerTransfer: s.limits.maxPerTransfer.toString(),
      depositRemainingToday: s.limits.depositRemainingToday.toString(),
    },
    transfers: s.transfers.map(serializeTransfer),
  };
}

async function requireCurrentAccount(session: SessionInfo) {
  const account = await getContainer().accountService.getCurrentForUser(session.userId);
  if (!account) {
    throw new AppError("NOT_FOUND", "No trading account", { subcode: "NO_ACCOUNT" });
  }
  return account;
}

/**
 * Cash summary for the user's current account. Opportunistically settles
 * the account's PENDING transfers first (like getMe → tryActivate) —
 * venue errors there are logged, never surfaced: the summary still renders.
 */
export async function getCash(session: SessionInfo): Promise<unknown> {
  const account = await requireCurrentAccount(session);
  const svc = getContainer().cashTransferService;
  await svc.syncPending(account.id);
  return serializeSummary(await svc.summary(account.id));
}

const transferBodySchema = z.object({
  direction: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  // shape is checked by parseTransferAmount (INVALID_AMOUNT) — strings only
  amount: z.string(),
});

const idempotencyKeySchema = z.string().uuid();

export async function requestTransfer(
  request: Request,
  session: SessionInfo,
): Promise<{ body: unknown; status: number }> {
  enforceRateLimit(`transfers:${session.userId}`, 20, 60_000);

  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
  if (!key.success) {
    throw new AppError("VALIDATION", "An Idempotency-Key header (UUID) is required");
  }
  const input = transferBodySchema.parse(await readJson(request));
  const amount = parseTransferAmount(input.amount);

  const account = await requireCurrentAccount(session);
  const svc = getContainer().cashTransferService;
  const { transfer, replayed } = await svc.request({
    accountId: account.id,
    direction: input.direction,
    amount,
    idempotencyKey: key.data,
  });
  const summary = await svc.summary(account.id);
  return {
    body: { transfer: serializeTransfer(transfer), cash: serializeSummary(summary) },
    status: replayed ? 200 : 201,
  };
}
