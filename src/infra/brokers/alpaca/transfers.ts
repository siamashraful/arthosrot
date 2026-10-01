import type {
  CashTransferDirection,
  VenueTransfer,
  VenueTransferState,
} from "@/core/cash-transfers";
import { Money } from "@/core/money";

/**
 * Alpaca Broker API transfer shapes → canonical VenueTransfer (ADR-015).
 * Vendor types never leave infra/brokers/alpaca.
 *
 * Transfer entity (GET/POST /v1/accounts/{id}/transfers): id, account_id,
 * relationship_id, type ('ach'|'wire'), status, reason, amount (decimal
 * string), direction ('INCOMING'|'OUTGOING'), created_at, updated_at, …
 */

export interface AlpacaTransfer {
  id: string;
  account_id: string;
  relationship_id?: string | null;
  type: string;
  status: string;
  reason?: string | null;
  amount: string;
  direction: "INCOMING" | "OUTGOING";
  created_at: string;
  updated_at?: string;
}

export interface AlpacaAchRelationship {
  id: string;
  account_id: string;
  status: string;
  created_at?: string;
}

/**
 * Status policy — conservative by construction: only COMPLETE posts money.
 * - QUEUED / APPROVAL_PENDING / PENDING / SENT_TO_CLEARING / APPROVED:
 *   in flight → PENDING (APPROVED is not yet "funds moved" for ACH; the
 *   observed sandbox ACH path is QUEUED → SENT_TO_CLEARING → COMPLETE).
 * - COMPLETE → SETTLED.
 * - REJECTED / CANCELED / RETURNED → FAILED (with the venue's reason).
 * - Anything unknown → PENDING: no ledger effect, a withdrawal keeps its
 *   hold, and the sweep keeps asking (never guess money moved).
 */
const STATUS_MAP: Record<string, VenueTransferState> = {
  QUEUED: "PENDING",
  APPROVAL_PENDING: "PENDING",
  PENDING: "PENDING",
  SENT_TO_CLEARING: "PENDING",
  APPROVED: "PENDING",
  COMPLETE: "SETTLED",
  REJECTED: "FAILED",
  CANCELED: "FAILED",
  RETURNED: "FAILED",
};

export function translateTransferStatus(status: string): VenueTransferState {
  return STATUS_MAP[status.toUpperCase()] ?? "PENDING";
}

/** ACH relationship statuses that can still carry a transfer. */
const USABLE_RELATIONSHIP = new Set(["APPROVED", "QUEUED", "PENDING", "SUBMITTED"]);

/** Prefer an APPROVED relationship, else any other usable one; never a canceled one. */
export function pickAchRelationship(rels: AlpacaAchRelationship[]): AlpacaAchRelationship | null {
  const usable = rels.filter((r) => USABLE_RELATIONSHIP.has(r.status.toUpperCase()));
  return usable.find((r) => r.status.toUpperCase() === "APPROVED") ?? usable[0] ?? null;
}

/**
 * Vendor decimal string → Money without float conversion. Accepts "500",
 * "500.5", "500.50", "500.500000" (trailing zeros beyond cents are trimmed);
 * real sub-cent precision is refused rather than rounded away.
 */
export function vendorAmountToMoney(raw: string): Money {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (!m) throw new Error(`alpaca transfer amount is not a decimal: ${JSON.stringify(raw)}`);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > 2) throw new Error(`alpaca transfer amount has sub-cent precision: ${raw}`);
  return Money.fromString(frac ? `${m[1]}.${frac}` : m[1]!);
}

export function directionFromVendor(direction: string): CashTransferDirection {
  if (direction === "INCOMING") return "DEPOSIT";
  if (direction === "OUTGOING") return "WITHDRAWAL";
  throw new Error(`alpaca transfer has unknown direction ${JSON.stringify(direction)}`);
}

export function directionToVendor(direction: CashTransferDirection): "INCOMING" | "OUTGOING" {
  return direction === "DEPOSIT" ? "INCOMING" : "OUTGOING";
}

/** Vendor RFC 3339 timestamp → Date; an unparseable value is refused, never guessed. */
export function vendorTimestamp(raw: unknown): Date {
  const at = typeof raw === "string" ? new Date(raw) : new Date(Number.NaN);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`alpaca transfer has an invalid created_at: ${JSON.stringify(raw)}`);
  }
  return at;
}

export function translateTransfer(t: AlpacaTransfer): VenueTransfer {
  const state = translateTransferStatus(t.status);
  return {
    venueTransferId: t.id,
    direction: directionFromVendor(t.direction),
    amount: vendorAmountToMoney(t.amount),
    state,
    failureReason:
      state === "FAILED"
        ? t.reason?.trim() || `Transfer ${t.status.toLowerCase()} by the venue`
        : null,
    createdAt: vendorTimestamp(t.created_at),
  };
}
