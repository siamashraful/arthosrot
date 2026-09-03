import type { Money } from "../money";
import { AppError } from "../shared";

/**
 * The FundingProvider port — the seam real-money deposits and withdrawals
 * will plug into (ADR-011). PORT ONLY: no implementation, adapter, route, or
 * env var exists, and none may be added without the live-trading ADR and the
 * SECURITY.md pre-live checklist. The shape is defined now so the live-mode
 * UI shells (FundingSheet) and the eventual backend meet at a contract that
 * was designed, not improvised.
 *
 * Design constraints for the future implementation (docs/LIVE_TRADING_TODO.md):
 * - Transfers are asynchronous facts from the funding rail, mirroring broker
 *   events: state changes arrive from the provider, are idempotent by
 *   externalTransferId, and are the ONLY input that may post DEPOSIT or
 *   WITHDRAWAL ledger entries.
 * - All amounts are Money (decimal); the ledger stays append-only.
 */

export type TransferDirection = "DEPOSIT" | "WITHDRAWAL";

export type TransferState = "PENDING" | "SETTLED" | "FAILED" | "CANCELED";

export interface FundingTransfer {
  /** Provider-assigned id — the idempotency key for state transitions. */
  externalTransferId: string;
  accountId: string;
  direction: TransferDirection;
  amount: Money;
  state: TransferState;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitiateTransferRequest {
  accountId: string;
  amount: Money;
  /** Provider-scoped funding-source reference (e.g. a linked bank relationship). */
  fundingSourceId: string;
}

export interface FundingProvider {
  initiateDeposit(req: InitiateTransferRequest): Promise<FundingTransfer>;
  initiateWithdrawal(req: InitiateTransferRequest): Promise<FundingTransfer>;
  listTransfers(accountId: string): Promise<FundingTransfer[]>;
}

/** Thrown by any funding path while live funding does not exist. */
export class FundingNotEnabledError extends AppError {
  constructor() {
    super("DOMAIN_RULE", "live funding is not enabled");
    this.name = "FundingNotEnabledError";
  }
}
