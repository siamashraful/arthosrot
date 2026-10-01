import { z } from "zod";
import { parseAlertThreshold, type PriceAlert } from "@/core/alerts";
import { AppError } from "@/core/shared";
import type { SessionInfo } from "../session";
import { getContainer } from "../container";
import { readJson } from "./http";
import { symbolSchema } from "./market";
import { enforceRateLimit } from "./rate-limit";

/**
 * Price alerts (ADR-016): GET/POST /api/v1/alerts, DELETE
 * /api/v1/alerts/[id], POST /api/v1/alerts/read, GET
 * /api/v1/alerts/unread-count. Alerts belong to the USER (not the paper
 * account), so they survive an account reset. Prices are 4dp strings.
 */

export function serializeAlert(a: PriceAlert) {
  return {
    id: a.id,
    symbol: a.symbol,
    direction: a.direction,
    threshold: a.threshold.toString(),
    state: a.state,
    createdAt: a.createdAt.toISOString(),
    triggeredAt: a.triggeredAt?.toISOString() ?? null,
    triggerPrice: a.triggerPrice?.toString() ?? null,
    triggerQuoteAt: a.triggerQuoteAt?.toISOString() ?? null,
    readAt: a.readAt?.toISOString() ?? null,
  };
}

const createAlertSchema = z.object({
  symbol: symbolSchema,
  direction: z.enum(["ABOVE", "BELOW"]),
  // shape is checked by parseAlertThreshold (INVALID_ALERT_PRICE): strings only
  price: z.string(),
});

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).max(500).optional() });

/**
 * The user's alerts, newest first, plus the unread count. Evaluates the
 * user's ACTIVE alerts first (opportunistic, like GET /account/cash settling
 * transfers) so alerts fire without the worker; a provider failure there is
 * logged, never surfaced.
 */
export async function listAlerts(session: SessionInfo): Promise<unknown> {
  const svc = getContainer().priceAlertService;
  await svc.evaluateForUser(session.userId);
  const { alerts, unreadCount } = await svc.list(session.userId);
  return { alerts: alerts.map(serializeAlert), unreadCount };
}

/** 201 for a new alert; 200 with the existing one for an identical ACTIVE alert. */
export async function createAlert(
  request: Request,
  session: SessionInfo,
): Promise<{ body: unknown; status: number }> {
  enforceRateLimit(`alerts:${session.userId}`, 30, 60_000);
  const input = createAlertSchema.parse(await readJson(request));
  const threshold = parseAlertThreshold(input.price);

  const { instrumentService, priceAlertService } = getContainer();
  // Same symbol resolution as order placement: unknown → 404 UNKNOWN_SYMBOL.
  const instrument = await instrumentService.getOrRegister(input.symbol);
  if (instrument.status !== "ACTIVE") {
    throw new AppError("DOMAIN_RULE", `${instrument.symbol} is no longer tradable`, {
      subcode: "INSTRUMENT_INACTIVE",
    });
  }
  const { alert, created } = await priceAlertService.create({
    userId: session.userId,
    symbol: instrument.symbol,
    direction: input.direction,
    threshold,
  });
  return { body: { alert: serializeAlert(alert), created }, status: created ? 201 : 200 };
}

export async function deleteAlert(alertId: string, session: SessionInfo): Promise<unknown> {
  // A malformed id is a missing alert, not a database error (uuid text).
  if (!z.string().uuid().safeParse(alertId).success) {
    throw new AppError("NOT_FOUND", "Alert not found");
  }
  const alert = await getContainer().priceAlertService.cancel(session.userId, alertId);
  return { alert: serializeAlert(alert) };
}

/**
 * Mark the user's triggered alerts read: all of them, or only `ids`. The body
 * is optional (empty = all); a malformed one is a 422.
 */
export async function markAlertsRead(request: Request, session: SessionInfo): Promise<unknown> {
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("VALIDATION", "Request body must be JSON");
    }
  }
  const { ids } = markReadSchema.parse(raw);
  const svc = getContainer().priceAlertService;
  const updated = await svc.markRead(session.userId, ids);
  return { updated, unreadCount: await svc.unreadCount(session.userId) };
}

/**
 * The bell's poll. Also evaluates the user's ACTIVE alerts (same
 * opportunistic path as the list), so the dot appears without the worker.
 */
export async function getUnreadCount(session: SessionInfo): Promise<unknown> {
  const svc = getContainer().priceAlertService;
  await svc.evaluateForUser(session.userId);
  return { unreadCount: await svc.unreadCount(session.userId) };
}
