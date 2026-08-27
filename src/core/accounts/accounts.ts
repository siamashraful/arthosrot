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
  /** Latest non-ARCHIVED account (any of PROVISIONING/ACTIVE/PROVISIONING_FAILED). */
  getCurrentForUser(tx: TxHandle, userId: string): Promise<Account | null>;
  /** Accounts awaiting venue funding confirmation (status = PROVISIONING). */
  listProvisioningIds(tx: TxHandle): Promise<string[]>;
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
  /**
   * Cash the venue reports as SETTLED for a provisioned account. Funding is
   * asynchronous at real venues (Alpaca sandbox ACH takes minutes — see
   * INTEGRATIONS.md), so activation must wait for this, never assume it.
   */
  settledCash(ref: BrokerAccountRef): Promise<Money>;
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
   * Open a paper account: create (PROVISIONING) -> provision the venue
   * account -> link it -> activate IF the venue already reports settled cash.
   * Venue funding is asynchronous (Alpaca ACH settles minutes later), so the
   * returned account may legitimately still be PROVISIONING; tryActivate()
   * completes it — from the user's own polling (getMe) and the worker sweep.
   * The DEPOSIT ledger entry IS the starting cash (invariant 6 — counted
   * once), and it is only posted at activation, so ledger and venue balance
   * can never disagree by construction.
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

    await this.txRunner.run((tx) => this.repo.linkBrokerAccount(tx, created.id, ref));
    return this.tryActivate(created.id);
  }

  /**
   * Activate a PROVISIONING account iff the venue reports the starting cash
   * as settled. Idempotent and race-safe: the status re-check happens under
   * the account row lock, so the DEPOSIT can never post twice no matter how
   * many pollers and workers call this concurrently.
   */
  async tryActivate(accountId: string): Promise<Account> {
    const { account, ref } = await this.txRunner.run(async (tx) => {
      const a = await this.repo.getById(tx, accountId);
      invariant(a, `tryActivate: account ${accountId} not found`);
      return { account: a, ref: await this.repo.getBrokerAccount(tx, accountId) };
    });
    if (account.status !== "PROVISIONING" || !ref) return account;

    const settled = await this.provisioner.settledCash(ref);
    if (settled.compare(account.startingCash) < 0) return account; // not yet funded

    return this.txRunner.run(async (tx) => {
      const locked = await this.repo.lockForUpdate(tx, accountId);
      if (locked.status !== "PROVISIONING") return locked; // lost the race — already done
      await this.repo.setStatus(tx, accountId, "ACTIVE");
      await this.getLedger().post(tx, {
        accountId,
        entryType: "DEPOSIT",
        amount: locked.startingCash,
        refType: "ACCOUNT",
        refId: accountId,
        description: "Opening deposit (simulated)",
      });
      const fresh = await this.repo.getById(tx, accountId);
      invariant(fresh, "account vanished during activation");
      return fresh;
    });
  }

  /** Worker/reconcile sweep: try to activate every account awaiting funding. */
  async activatePendingAccounts(): Promise<{ checked: number; activated: number }> {
    const ids = await this.txRunner.run((tx) => this.repo.listProvisioningIds(tx));
    let activated = 0;
    for (const id of ids) {
      try {
        const account = await this.tryActivate(id);
        if (account.status === "ACTIVE") activated += 1;
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "provisioning sweep",
            accountId: id,
            err: String(err),
          }),
        );
      }
    }
    return { checked: ids.length, activated };
  }

  async getCurrentForUser(userId: string): Promise<Account | null> {
    return this.txRunner.run((tx) => this.repo.getCurrentForUser(tx, userId));
  }

  async getActiveForUser(userId: string): Promise<Account | null> {
    return this.txRunner.run((tx) => this.repo.getActiveForUser(tx, userId));
  }

  /**
   * Reset step 2..7 (docs/architecture/DATA_MODEL.md): archive the current
   * account (history preserved — nothing deleted, invariant 14) and provision
   * a fresh one with a new opening DEPOSIT. The caller (server/api/account)
   * must have cancelled eligible open orders FIRST.
   */
  async archiveAndReprovision(userId: string): Promise<Account> {
    const current = await this.txRunner.run(async (tx) => {
      const account = await this.repo.getActiveForUser(tx, userId);
      invariant(account, "no active account to reset");
      await this.repo.archiveBrokerAccount(tx, account.id);
      await this.repo.setStatus(tx, account.id, "ARCHIVED");
      return account;
    });
    return this.openPaperAccount(userId, current.startingCash);
  }
}
