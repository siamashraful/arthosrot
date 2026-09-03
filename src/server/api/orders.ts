import { z } from "zod";
import { Px, Qty } from "@/core/money";
import { STATE_DISPLAY, type Order } from "@/core/orders";
import { AppError, systemClock } from "@/core/shared";
import { accountsRepository } from "@/infra/db/repositories/accounts";
import { pgTransactionRunner } from "@/infra/db/tx";
import type { SessionInfo } from "../session";
import { requireActiveAccount } from "./portfolio";
import { symbolSchema } from "./market";
import { enforceRateLimit } from "./rate-limit";
import { getContainer } from "../container";

const placeOrderSchema = z.object({
  symbol: symbolSchema,
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  qty: z.number().int().positive().max(1_000_000),
  limitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  idempotencyKey: z.string().uuid(),
});

export function serializeOrder(order: Order) {
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
  const input = placeOrderSchema.parse(await request.json());
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
    await getContainer().executionService.submit(placed.order.id);
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
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
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
  // Ask the venue to cancel (outcome arrives as a canonical event).
  await getContainer().executionService.requestVenueCancel(cancelled.id);
  const current = await pgTransactionRunner.run((tx) =>
    getContainer().ordersService.getById(tx, cancelled.id),
  );
  return { order: serializeOrder(current ?? cancelled) };
}
