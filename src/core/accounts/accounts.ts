import { Money } from "../money";
import { invariant, type TransactionRunner, type TxHandle } from "../shared";
import type { CashProjection, LedgerService } from "../ledger";

/**
 * Account lifecycle (docs/architecture/DATA_MODEL.md):
 * PROVISIONING -> ACTIVE (venue account exists + opening DEPOSIT posted)
 * ACTIVE -> ARCHIVED (reset; history preserved)
 * PROVISIONING -> PROVISIONING_FAILED
 */

export type AccountStatus = "PROVISIONING" | "ACTIVE" | "ARCHIVED" | "PROVISIONING_FAILED";
export type BrokerKindId = "DETERMINISTIC" | "ALPACA_PAPER";

export interface Account {
  id: string;
  userId: string;
  mode: "PAPER";
  status: AccountStatus;
  currency: "USD";
  startingCash: Money;
  cashBalance: Money;
  createdAt: Date;
}

export interface BrokerAccountRef {
  broker: BrokerKindId;
  externalAccountId: string;
}

export interface AccountsRepository {
  create(tx: TxHandle, input: { userId: string; startingCash: Money }): Promise<Account>;
  getById(tx: TxHandle, id: string): Promise<Account | null>;
  getActiveForUser(tx: TxHandle, userId: string): Promise<Account | null>;
  /** SELECT ... FOR UPDATE — the serialization point for placement/fills. */
  lockForUpdate(tx: TxHandle, id: string): Promise<Account>;
  setStatus(tx: TxHandle, id: string, status: AccountStatus): Promise<void>;
  adjustCash(tx: TxHandle, id: string, delta: Money): Promise<void>;
  getCachedCash(tx: TxHandle, id: string): Promise<Money>;
  linkBrokerAccount(tx: TxHandle, accountId: string, ref: BrokerAccountRef): Promise<void>;
  getBrokerAccount(tx: TxHandle, accountId: string): Promise<BrokerAccountRef | null>;
  archiveBrokerAccount(tx: TxHandle, accountId: string): Promise<void>;
}

/**
 * Provisions the venue-side account. The deterministic implementation is
 * instant; the Alpaca implementation creates + funds a sandbox brokerage
 * account (arrives with the execution phases).
 */
export interface AccountProvisioner {
  provision(account: Account): Promise<BrokerAccountRef>;
}

export class AccountService implements CashProjection {
  constructor(
    private readonly repo: AccountsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly provisioner: AccountProvisioner,
    private readonly getLedger: () => LedgerService,
  ) {}

  // CashProjection port (used by LedgerService)
  adjustCash(tx: TxHandle, accountId: string, delta: Money): Promise<void> {
    return this.repo.adjustCash(tx, accountId, delta);
  }

  getCachedCash(tx: TxHandle, accountId: string): Promise<Money> {
    return this.repo.getCachedCash(tx, accountId);
  }

  /**
   * Open a paper account for a user: create (PROVISIONING) -> provision the
   * venue account -> activate + post the opening DEPOSIT atomically.
   * The DEPOSIT ledger entry IS the starting cash (invariant 6 — counted once).
   */
  async openPaperAccount(userId: string, startingCash: Money): Promise<Account> {
    invariant(
      !startingCash.isNegative() && !startingCash.isZero(),
      "starting cash must be positive",
    );

    const created = await this.txRunner.run((tx) => this.repo.create(tx, { userId, startingCash }));

    let ref: BrokerAccountRef;
    try {
      ref = await this.provisioner.provision(created);
    } catch (err) {
      await this.txRunner.run((tx) => this.repo.setStatus(tx, created.id, "PROVISIONING_FAILED"));
      throw err;
    }

    return this.txRunner.run(async (tx) => {
      await this.repo.linkBrokerAccount(tx, created.id, ref);
      await this.repo.setStatus(tx, created.id, "ACTIVE");
      await this.getLedger().post(tx, {
        accountId: created.id,
        entryType: "DEPOSIT",
        amount: startingCash,
        refType: "ACCOUNT",
        refId: created.id,
        description: "Opening deposit (simulated)",
      });
      const account = await this.repo.getById(tx, created.id);
      invariant(account, "account vanished during activation");
      return account;
    });
  }

  async getActiveForUser(userId: string): Promise<Account | null> {
    return this.txRunner.run((tx) => this.repo.getActiveForUser(tx, userId));
  }
}
