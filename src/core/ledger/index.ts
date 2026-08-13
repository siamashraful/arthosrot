/**
 * core/ledger — authoritative cash history (append-only) + cash projection
 * maintenance and reconciliation (ADR-004, invariant 6/8).
 */
export {
  LedgerService,
  type CashProjection,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerRepository,
  type NewLedgerEntry,
  type ReconcileResult,
} from "./ledger";
