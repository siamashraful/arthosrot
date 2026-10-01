import { z } from "zod";
import { Px, Qty } from "@/core/money";
import { STATE_DISPLAY, type Order } from "@/core/orders";
import { AppError, systemClock } from "@/core/shared";
import { accountsRepository } from "@/infra/db/repositories/accounts";
import { pgTransactionRunner } from "@/infra/db/tx";
import type { SessionInfo } from "../session";
import { requireActiveAccount } from "./portfolio";
import { symbolSchema } from "./market";
import { readJson } from "./http";
import { enforceRateLimit } from "./rate-limit";
import { getContainer } from "../container";

const placeOrderSchema = z.object({
  symbol: symbolSchema,
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  qty: z.number().int().positive().max(1_000_000),
  // ≤4dp (Px precision) and ≤10 integer digits, so it always fits
  // limit_price NUMERIC(18,4); zero is refused here — Px is strictly positive.
  limitPrice: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,4})?$/, "Limit price must be a decimal with at most 4 places")
    .refine((s) => /[1-9]/.test(s), "Limit price must be greater than zero")
    .optional(),
  idempotencyKey: z.string().uuid(),
});

const listOrdersQuerySchema = z.object({ status: z.enum(["all", "open"]).default("all") });

function serializeOrder(order: Order) {
  return {
    id: order.id,
    accountId: order.accountId,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    tif: order.tif,
    qty: order.qty.toString(),
    limitPrice: order.limitPrice?.toString() ?? null,
    state: order.state,
    stateDisplay: STATE_DISPLAY[order.state],
    filledQty: order.filledQty.toString(),
    reservedCash: order.reservedCash.toString(),
    rejectReason: order.rejectReason,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function logAfterCommit(msg: string, orderId: string, err: unknown): void {
  console.error(JSON.stringify({ level: "error", msg, orderId, err: String(err) }));
}

/** Ownership guard: the order's account must belong to the session user (else 404). */
async function requireOwnedOrder(session: SessionInfo, orderId: string): Promise<Order> {
  const uuid = z.string().uuid().safeParse(orderId);
  if (!uuid.success) throw new AppError("NOT_FOUND", "Order not found");
  return pgTransactionRunner.run(async (tx) => {
    const order = await getContainer().ordersService.getById(tx, orderId);
    if (!order) throw new AppError("NOT_FOUND", "Order not found");
    const account = await accountsRepository.getById(tx, order.accountId);
    if (!account || account.userId !== session.userId) {
      throw new AppError("NOT_FOUND", "Order not found");
    }
    return order;
  });
}

export async function placeOrder(
  request: Request,
  session: SessionInfo,
): Promise<{ body: unknown; status: number }> {
  enforceRateLimit(`orders:${session.userId}`, 60, 60_000);
  const input = placeOrderSchema.parse(await readJson(request));
  const { instrumentService, marketData, ordersService } = getContainer();

  const account = await requireActiveAccount(session);
  const instrument = await instrumentService.getOrRegister(input.symbol);

  let refPrice: Px | null = null;
  if (input.side === "BUY" && input.type === "MARKET") {
    const quote = await marketData.getQuote(instrument.symbol);
    refPrice = quote.ask ?? quote.last;
  }

  const placed = await ordersService.place({
    account,
    instrument,
    side: input.side,
    type: input.type,
    qty: Qty.of(input.qty),
    limitPrice: input.limitPrice ? Px.fromString(input.limitPrice) : null,
    refPrice,
    idempotencyKey: input.idempotencyKey,
  });

  // Submission to the broker happens via ExecutionService (async lifecycle);
  // a replay returns the original resource with 200.
  if (!placed.replayed) {
    // The order is committed: from here the response must describe it, not
    // a transport error. A submit that throws (the venue has the order but
    // our call failed) converges through events/reconciliation; the order is
    // returned in its real current state.
    await getContainer()
      .executionService.submit(placed.order.id)
      .catch((err: unknown) =>
        logAfterCommit("order submit failed after commit", placed.order.id, err),
      );
  }

  const current = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.getById(tx, placed.order.id),
  );
  return {
    body: { order: serializeOrder(current ?? placed.order), replayed: placed.replayed },
    status: placed.replayed ? 200 : 201,
  };
}

export async function listOrders(request: Request, session: SessionInfo): Promise<unknown> {
  const { status } = listOrdersQuerySchema.parse({
    status: new URL(request.url).searchParams.get("status") ?? undefined,
  });
  const account = await requireActiveAccount(session);
  // Deterministic mode: polling doubles as the venue tick, so resting limit
  // orders progress during local development without a separate scheduler.
  const det = getContainer().deterministicBroker;
  if (det) await det.tick();
  const orders = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.list(tx, account.id, status === "open"),
  );
  return { orders: orders.map(serializeOrder) };
}

export async function getOrderDetail(orderId: string, session: SessionInfo): Promise<unknown> {
  // Deterministic mode: the detail page's polling is a venue tick too (as in
  // listOrders), so a resting order watched only here still progresses.
  const det = getContainer().deterministicBroker;
  if (det) await det.tick();
  const order = await requireOwnedOrder(session, orderId);
  const events = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.listEvents(tx, order.id),
  );
  const fills = await getContainer().fillsReader.listForOrder(order.id);
  return {
    order: serializeOrder(order),
    events: events.map((e) => ({
      type: e.canonicalEventType,
      fromState: e.fromState,
      toState: e.toState,
      source: e.source,
      occurredAt: e.occurredAt.toISOString(),
    })),
    fills,
  };
}

export async function cancelOrder(orderId: string, session: SessionInfo): Promise<unknown> {
  const order = await requireOwnedOrder(session, orderId);
  const cancelled = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.requestCancel(tx, order.id, systemClock.now()),
  );
  // Ask the venue to cancel (outcome arrives as a canonical event). The
  // local CANCEL_PENDING is committed; if the request fails, the order is
  // returned as it is and reconciliation re-sends the cancel.
  const outcome = await getContainer()
    .executionService.requestVenueCancel(cancelled.id)
    .catch((err: unknown) => {
      logAfterCommit("venue cancel failed after commit", cancelled.id, err);
      return null;
    });
  // The venue refused (e.g. the order already filled): local state is behind
  // the venue. Reconcile this account now so the response carries the truth.
  if (outcome && !outcome.accepted) {
    await getContainer()
      .reconciliationService.reconcileAccountNow(cancelled.accountId)
      .catch((err: unknown) => logAfterCommit("reconcile after refused cancel", cancelled.id, err));
  }
  const current = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.getById(tx, cancelled.id),
  );
  return { order: serializeOrder(current ?? cancelled) };
}
