import { Money } from "../money";
import { invariant, type TxHandle } from "../shared";

/**
 * The append-only ledger is the authoritative Arthosrot record of cash
 * movements (ADR-004). accounts.cash_balance is a cached projection kept in
 * sync by post(); reconcile() asserts invariant 6.
 */

export type LedgerEntryType = "DEPOSIT" | "TRADE" | "FEE" | "ADJUSTMENT";

export interface LedgerEntry {
  id: string;
  accountId: string;
  entryType: LedgerEntryType;
  /** Signed: positive = cash in, negative = cash out. Never zero. */
  amount: Money;
  refType: string | null;
  refId: string | null;
  description: string;
  createdAt: Date;
}

export interface NewLedgerEntry {
  accountId: string;
  entryType: LedgerEntryType;
  amount: Money;
  refType?: string;
  refId?: string;
  description: string;
}

export interface LedgerRepository {
  insert(tx: TxHandle, entry: NewLedgerEntry): Promise<LedgerEntry>;
  sumForAccount(tx: TxHandle, accountId: string): Promise<Money>;
  listForAccount(
    tx: TxHandle,
    accountId: string,
    limit: number,
    beforeId?: string,
  ): Promise<LedgerEntry[]>;
}

/** Port implemented by core/accounts — lets the ledger bump the cash projection. */
export interface CashProjection {
  adjustCash(tx: TxHandle, accountId: string, delta: Money): Promise<void>;
  getCachedCash(tx: TxHandle, accountId: string): Promise<Money>;
}

export interface ReconcileResult {
  projected: Money;
  cached: Money;
  drift: Money;
  inBalance: boolean;
}

export class LedgerService {
  constructor(
    private readonly repo: LedgerRepository,
    private readonly cash: CashProjection,
  ) {}

  /**
   * Post an entry and update the cash projection atomically (same tx).
   * The caller owns the transaction.
   */
  async post(tx: TxHandle, entry: NewLedgerEntry): Promise<LedgerEntry> {
    invariant(!entry.amount.isZero(), "ledger entries must have a non-zero amount");
    const inserted = await this.repo.insert(tx, entry);
    await this.cash.adjustCash(tx, entry.accountId, entry.amount);
    return inserted;
  }

  /** Invariant 6: cached cash projection equals the sum of ledger entries. */
  async reconcile(tx: TxHandle, accountId: string): Promise<ReconcileResult> {
    const projected = await this.repo.sumForAccount(tx, accountId);
    const cached = await this.cash.getCachedCash(tx, accountId);
    const drift = cached.subtract(projected);
    return { projected, cached, drift, inBalance: drift.isZero() };
  }

  list(tx: TxHandle, accountId: string, limit = 50, beforeId?: string): Promise<LedgerEntry[]> {
    return this.repo.listForAccount(tx, accountId, limit, beforeId);
  }
}
