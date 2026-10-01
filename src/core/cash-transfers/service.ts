import type { Account, AccountsRepository, BrokerAccountRef } from "../accounts";
import type { LedgerService } from "../ledger";
import { Money } from "../money";
import { AppError, invariant, type Clock, type TransactionRunner, type TxHandle } from "../shared";
import {
  canTransition,
  checkTransferRequest,
  computeWithdrawable,
  depositRemaining,
  requestFingerprint,
  type CashTransferDirection,
  type CashTransferState,
  type TransferLimits,
} from "./rules";

/**
 * Paper-account cash deposits and withdrawals (ADR-015). PAPER-ONLY by
 * construction: it runs against the configured paper venue (deterministic or
 * Alpaca sandbox) and is entirely separate from core/funding's live
 * FundingProvider port, which stays unimplemented (ADR-011).
 *
 * Financial rules:
 * - A DEPOSIT ledger entry posts ONLY when the venue reports the transfer
 *   settled (ledger cash never exceeds venue cash — same rule as the opening
 *   deposit). Pending deposits raise nothing.
 * - A WITHDRAWAL is checked against `withdrawable` under the account row
 *   lock and immediately HOLDS its amount while PENDING: order placement's
 *   buying power and the withdrawable figure both subtract pending
 *   withdrawals. The negative WITHDRAWAL entry posts when SETTLED;
 *   FAILED/CANCELED releases the hold and posts nothing.
 * - Every state change happens under account → transfer FOR UPDATE locks,
 *   PENDING is the only non-terminal state, and the ledger entry's ref is
 *   the transfer id (DB-unique), so settling twice posts once.
 */

export interface CashTransfer {
  id: string;
  accountId: string;
  direction: CashTransferDirection;
  amount: Money;
  state: CashTransferState;
  venueTransferId: string | null;
  idempotencyKey: string;
  requestHash: string;
  failureReason: string | null;
  createdAt: Date;
  settledAt: Date | null;
  updatedAt: Date;
}

export interface NewCashTransfer {
  accountId: string;
  direction: CashTransferDirection;
  amount: Money;
  idempotencyKey: string;
  requestHash: string;
}

export interface CashTransfersRepository {
  /** Insert PENDING; null on UNIQUE(account_id, idempotency_key) conflict. */
  insert(tx: TxHandle, input: NewCashTransfer): Promise<CashTransfer | null>;
  getById(tx: TxHandle, id: string): Promise<CashTransfer | null>;
  getByIdForUpdate(tx: TxHandle, id: string): Promise<CashTransfer | null>;
  getByIdempotencyKey(tx: TxHandle, accountId: string, key: string): Promise<CashTransfer | null>;
  /** Newest first. */
  listForAccount(tx: TxHandle, accountId: string, limit: number): Promise<CashTransfer[]>;
  listPendingForAccount(tx: TxHandle, accountId: string): Promise<CashTransfer[]>;
  listAccountIdsWithPending(tx: TxHandle): Promise<string[]>;
  /** Σ amount of PENDING transfers in one direction. */
  sumPending(tx: TxHandle, accountId: string, direction: CashTransferDirection): Promise<Money>;
  /** Σ amount of PENDING + SETTLED deposits created at/after `since`. */
  sumDepositsSince(tx: TxHandle, accountId: string, since: Date): Promise<Money>;
  /** True if any local transfer already carries this venue id. */
  isVenueIdLinked(tx: TxHandle, venueTransferId: string): Promise<boolean>;
  /**
   * CANCELED transfers that carry a venue id, were canceled for one of
   * `reasons` (account reset / archived) and were created at/after `since` —
   * the venue may still settle them, so the sweep keeps watching.
   */
  listCanceledWithVenueId(
    tx: TxHandle,
    reasons: readonly string[],
    since: Date,
  ): Promise<CashTransfer[]>;
  setVenueTransferId(tx: TxHandle, id: string, venueTransferId: string): Promise<void>;
  setState(
    tx: TxHandle,
    id: string,
    patch: { state: CashTransferState; failureReason?: string | null; settledAt?: Date | null },
  ): Promise<void>;
}

/** Read port implemented by the orders repository (Σ open BUY reservations). */
export interface BuyReservationReader {
  sumOpenBuyReservations(tx: TxHandle, accountId: string): Promise<Money>;
}

/** The venue's view of a transfer, canonicalized by the adapter. */
export type VenueTransferState = "PENDING" | "SETTLED" | "FAILED";

export interface VenueTransfer {
  venueTransferId: string;
  direction: CashTransferDirection;
  amount: Money;
  state: VenueTransferState;
  /** Venue-provided reason for FAILED (or null). */
  failureReason: string | null;
  createdAt: Date;
}

/** A venue transfer listing, honest about rows it could not read. */
export interface VenueTransferListing {
  transfers: VenueTransfer[];
  /**
   * false when the venue returned rows the adapter could not read (malformed
   * date, amount or direction — logged by the adapter). Absence from
   * `transfers` then proves nothing, so nothing may be FAILED on it.
   */
  complete: boolean;
}

/**
 * Venue port for moving simulated cash in/out of a PAPER venue account.
 * Implemented by DeterministicPaperBroker (settles synchronously) and
 * AlpacaPaperBroker (sandbox ACH, settles asynchronously).
 */
export interface CashTransferVenue {
  initiate(
    ref: BrokerAccountRef,
    req: { transferId: string; direction: CashTransferDirection; amount: Money },
  ): Promise<VenueTransfer>;
  /** null = the venue has no transfer with this id (authoritative: every page read). */
  getTransfer(ref: BrokerAccountRef, venueTransferId: string): Promise<VenueTransfer | null>;
  /**
   * USER-initiated transfers created at/after `since` (the venue account's
   * opening funding transfer is never listed — it is not a cash_transfers
   * row and must never be linked to one).
   */
  listTransfers(ref: BrokerAccountRef, since: Date): Promise<VenueTransferListing>;
  /** Best-effort cancel of a PENDING venue transfer; true = the venue accepted it. */
  cancelTransfer(ref: BrokerAccountRef, venueTransferId: string): Promise<boolean>;
}

/**
 * Thrown by a venue adapter when the venue DEFINITIVELY refused a transfer
 * (4xx: cap exceeded, bad relationship…). Anything else thrown is ambiguous
 * (timeout, 5xx): the transfer may exist at the venue, so it stays PENDING
 * and the sweep recovers it.
 */
export class TransferRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`venue rejected transfer: ${reason}`);
    this.name = "TransferRejectedError";
  }
}

export interface CashSummary {
  status: Account["status"];
  cash: Money;
  reservedForOrders: Money;
  pendingDeposits: Money;
  pendingWithdrawals: Money;
  withdrawable: Money;
  limits: { minAmount: Money; maxPerTransfer: Money; depositRemainingToday: Money };
  transfers: CashTransfer[];
}

export interface CashTransfersConfig {
  limits: TransferLimits;
  /** A PENDING transfer with no venue id (or one the venue doesn't know) is
   *  only failed after this long — the initiate call may still be in flight. */
  venueGraceMs: number;
  /** Transfers shown in the summary (newest first). */
  historyLimit: number;
}

export interface RequestTransferInput {
  accountId: string;
  direction: CashTransferDirection;
  amount: Money;
  idempotencyKey: string;
}

export interface SweepResult {
  accountsChecked: number;
  transfersChecked: number;
  settled: number;
  failed: number;
  errors: number;
  /** Transfers canceled by a reset that the venue settled anyway (operator review). */
  divergedAfterReset: number;
}

const DEPOSIT_DESCRIPTION = "Deposit (simulated)";
const WITHDRAWAL_DESCRIPTION = "Withdrawal (simulated)";
const LEDGER_REF_TYPE = "CASH_TRANSFER";
/**
 * Recovery window: a lost venue id is only matched to a venue transfer
 * created within ± this of the local row's created_at (initiate runs
 * immediately after the insert; the slack absorbs venue clock skew).
 */
export const RECOVERY_WINDOW_MS = 5 * 60_000;
/** How long transfers canceled by a reset stay watched for a late venue settlement. */
const RESET_WATCH_MS = 7 * 24 * 60 * 60_000;

/** failure_reason values (UI-visible) — the watch query matches on them. */
export const RESET_CANCEL_REASON = "Canceled by account reset";
export const INACTIVE_CANCEL_REASON = "Account is no longer active";
const VENUE_CONFIRMED_SUFFIX = " (venue confirmed it never settled)";
const VENUE_SETTLED_ANYWAY_REASON =
  "Canceled by account reset, but the venue settled it anyway. Operator review required.";

export class CashTransferService {
  constructor(
    private readonly repo: CashTransfersRepository,
    private readonly accounts: AccountsRepository,
    private readonly reservations: BuyReservationReader,
    private readonly getLedger: () => LedgerService,
    private readonly venue: CashTransferVenue,
    private readonly txRunner: TransactionRunner,
    private readonly clock: Clock,
    private readonly config: CashTransfersConfig,
  ) {
    // Recovery only runs past the grace window, so a still-in-flight newer
    // request's venue transfer (created ≈ now) lies outside the older row's
    // ± window and can never be stolen — provided grace > window.
    invariant(
      config.venueGraceMs > RECOVERY_WINDOW_MS,
      "venueGraceMs must exceed the recovery window (see RECOVERY_WINDOW_MS)",
    );
  }

  /** Consistent snapshot of the account's cash figures + recent transfers. */
  async summary(accountId: string): Promise<CashSummary> {
    return this.txRunner.run(async (tx) => {
      const account = await this.accounts.getById(tx, accountId);
      invariant(account, `summary: account ${accountId} not found`);
      // Sequential: one transaction = one connection (no pipelined queries).
      const reserved = await this.reservations.sumOpenBuyReservations(tx, accountId);
      const pendingDeposits = await this.repo.sumPending(tx, accountId, "DEPOSIT");
      const pendingWithdrawals = await this.repo.sumPending(tx, accountId, "WITHDRAWAL");
      const deposited = await this.depositedInWindow(tx, account);
      const transfers = await this.repo.listForAccount(tx, accountId, this.config.historyLimit);
      const { limits } = this.config;
      return {
        status: account.status,
        cash: account.cashBalance,
        reservedForOrders: reserved,
        pendingDeposits,
        pendingWithdrawals,
        withdrawable:
          account.status === "ACTIVE"
            ? computeWithdrawable(account.cashBalance, reserved, pendingWithdrawals)
            : Money.zero(),
        limits: {
          minAmount: limits.minAmount,
          maxPerTransfer: limits.maxPerTransfer,
          depositRemainingToday: depositRemaining(limits, deposited),
        },
        transfers,
      };
    });
  }

  /**
   * Create a transfer: lock → idempotency → rules → insert PENDING (the
   * withdrawal hold takes effect at this commit) → initiate at the venue
   * outside the lock → apply the venue's answer. A replay with the same key
   * and same body returns the original; a different body is a CONFLICT.
   */
  async request(
    input: RequestTransferInput,
  ): Promise<{ transfer: CashTransfer; replayed: boolean }> {
    const fingerprint = requestFingerprint(input.direction, input.amount);

    const created = await this.txRunner.run(async (tx) => {
      const account = await this.accounts.lockForUpdate(tx, input.accountId);

      const existing = await this.repo.getByIdempotencyKey(tx, account.id, input.idempotencyKey);
      if (existing) return { transfer: this.assertSameRequest(existing, fingerprint), ref: null };

      if (account.status !== "ACTIVE") {
        throw new AppError("DOMAIN_RULE", "Trading account is not active", {
          subcode: "ACCOUNT_NOT_ACTIVE",
        });
      }

      const withdrawable =
        input.direction === "WITHDRAWAL"
          ? computeWithdrawable(
              account.cashBalance,
              await this.reservations.sumOpenBuyReservations(tx, account.id),
              await this.repo.sumPending(tx, account.id, "WITHDRAWAL"),
            )
          : Money.zero();
      const depositedInWindow =
        input.direction === "DEPOSIT" ? await this.depositedInWindow(tx, account) : Money.zero();

      checkTransferRequest({
        direction: input.direction,
        amount: input.amount,
        limits: this.config.limits,
        withdrawable,
        depositedInWindow,
      });

      const ref = await this.accounts.getBrokerAccount(tx, account.id);
      invariant(ref, `active account ${account.id} has no venue account`);

      const inserted = await this.repo.insert(tx, {
        accountId: account.id,
        direction: input.direction,
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
        requestHash: fingerprint,
      });
      if (inserted) return { transfer: inserted, ref };
      // Unreachable under the account lock, but never trust that blindly.
      const raced = await this.repo.getByIdempotencyKey(tx, account.id, input.idempotencyKey);
      invariant(raced, "idempotency conflict without a matching transfer");
      return { transfer: this.assertSameRequest(raced, fingerprint), ref: null };
    });

    if (!created.ref) return { transfer: created.transfer, replayed: true };

    const transfer = created.transfer;
    try {
      const venueTransfer = await this.venue.initiate(created.ref, {
        transferId: transfer.id,
        direction: transfer.direction,
        amount: transfer.amount,
      });
      await this.applyVenueState(transfer.id, venueTransfer);
    } catch (err) {
      if (err instanceof TransferRejectedError) {
        await this.finish(transfer.id, "FAILED", err.reason);
      } else {
        // Ambiguous: the venue may have created it. Stay PENDING (a
        // withdrawal keeps its hold); the sweep links or fails it later.
        this.log("warn", "transfer initiate failed; left PENDING for the sweep", transfer.id, err);
      }
    }
    return { transfer: await this.mustGet(transfer.id), replayed: false };
  }

  /**
   * Poll the venue for every PENDING transfer of one account and apply what
   * it reports. Never throws: per-transfer failures are logged and counted
   * (the GET summary calls this opportunistically).
   */
  async syncPending(accountId: string, result?: SweepResult): Promise<SweepResult> {
    const out = result ?? emptySweep();
    let pending: CashTransfer[];
    let ref: BrokerAccountRef | null;
    try {
      [pending, ref] = await this.txRunner.run(async (tx) => [
        await this.repo.listPendingForAccount(tx, accountId),
        await this.accounts.getBrokerAccount(tx, accountId),
      ]);
    } catch (err) {
      out.errors += 1;
      this.log("error", "transfer sync: load failed", accountId, err);
      return out;
    }
    if (pending.length === 0) return out;

    // ONE venue listing per account per pass (a poll used to page the
    // venue's transfer list once per pending transfer).
    let listing: VenueTransferListing | null = null;
    if (ref) {
      const earliest = Math.min(...pending.map((t) => t.createdAt.getTime()));
      try {
        listing = await this.venue.listTransfers(ref, new Date(earliest - RECOVERY_WINDOW_MS));
      } catch (err) {
        out.errors += 1;
        this.log("error", "transfer sync: venue listing failed", accountId, err);
      }
    }

    for (const transfer of pending) {
      out.transfersChecked += 1;
      try {
        const state = await this.syncOne(transfer, ref, listing);
        if (state === "SETTLED") out.settled += 1;
        if (state === "FAILED" || state === "CANCELED") out.failed += 1;
      } catch (err) {
        out.errors += 1;
        this.log("error", "transfer sync failed", transfer.id, err);
      }
    }
    return out;
  }

  /** Worker sweep: settle/fail PENDING transfers across all accounts. */
  async sweepPending(): Promise<SweepResult> {
    const out = emptySweep();
    const accountIds = await this.txRunner.run((tx) => this.repo.listAccountIdsWithPending(tx));
    for (const accountId of accountIds) {
      out.accountsChecked += 1;
      await this.syncPending(accountId, out);
    }
    await this.watchCanceledByReset(out);
    return out;
  }

  /**
   * Before a reset archives the account: ask the venue to cancel every
   * PENDING transfer it knows (best effort — the archive hook then cancels
   * them locally either way). Never throws; refusals and errors are logged
   * loudly, and the sweep watches those transfers for a late settlement.
   */
  async cancelPendingAtVenue(accountId: string): Promise<{ requested: number; refused: number }> {
    const out = { requested: 0, refused: 0 };
    let pending: CashTransfer[];
    let ref: BrokerAccountRef | null;
    try {
      [pending, ref] = await this.txRunner.run(async (tx) => [
        await this.repo.listPendingForAccount(tx, accountId),
        await this.accounts.getBrokerAccount(tx, accountId),
      ]);
    } catch (err) {
      this.log("error", "reset: could not load pending transfers", accountId, err);
      return out;
    }
    if (!ref) return out;
    for (const t of pending) {
      if (!t.venueTransferId) continue; // nothing to name at the venue
      out.requested += 1;
      const accepted = await this.venue
        .cancelTransfer(ref, t.venueTransferId)
        .catch((err: unknown) => {
          this.log("error", "reset: venue transfer cancel failed", t.id, err);
          return false;
        });
      if (!accepted) {
        out.refused += 1;
        this.log(
          "error",
          "reset: venue did not cancel a pending transfer; watching it for a late settlement",
          t.id,
          t.venueTransferId,
        );
      }
    }
    return out;
  }

  /**
   * Transfers canceled locally by a reset may still settle at the venue
   * (the cancel can lose the race with ACH). No money moves on the archived
   * account without an operator — but it must never diverge SILENTLY: a
   * venue SETTLED is logged as an error with ids and stamped on the row
   * (failure_reason), the operator ADJUSTMENT path of ADR-015.
   */
  private async watchCanceledByReset(out: SweepResult): Promise<void> {
    let watched: CashTransfer[];
    try {
      watched = await this.txRunner.run((tx) =>
        this.repo.listCanceledWithVenueId(
          tx,
          [RESET_CANCEL_REASON, INACTIVE_CANCEL_REASON],
          new Date(this.clock.now().getTime() - RESET_WATCH_MS),
        ),
      );
    } catch (err) {
      out.errors += 1;
      this.log("error", "reset watch: load failed", "-", err);
      return;
    }
    for (const t of watched) {
      try {
        const ref = await this.txRunner.run((tx) =>
          this.accounts.getBrokerAccount(tx, t.accountId),
        );
        if (!ref || !t.venueTransferId) continue;
        const venueTransfer = await this.venue.getTransfer(ref, t.venueTransferId);
        if (!venueTransfer || venueTransfer.state === "PENDING") continue; // keep watching
        const diverged = venueTransfer.state === "SETTLED";
        await this.txRunner.run(async (tx) => {
          await this.accounts.lockForUpdate(tx, t.accountId);
          const locked = await this.repo.getByIdForUpdate(tx, t.id);
          if (locked?.state !== "CANCELED") return;
          await this.repo.setState(tx, t.id, {
            state: "CANCELED",
            failureReason: diverged
              ? VENUE_SETTLED_ANYWAY_REASON
              : `${locked.failureReason ?? RESET_CANCEL_REASON}${VENUE_CONFIRMED_SUFFIX}`,
          });
        });
        if (diverged) {
          out.divergedAfterReset += 1;
          console.error(
            JSON.stringify({
              level: "error",
              msg: "venue settled a transfer canceled by account reset — ledger and venue cash diverge on the archived account; post an operator ADJUSTMENT (ADR-015)",
              transferId: t.id,
              accountId: t.accountId,
              venueTransferId: t.venueTransferId,
              direction: t.direction,
              amount: t.amount.toString(),
            }),
          );
        }
      } catch (err) {
        out.errors += 1;
        this.log("error", "reset watch failed", t.id, err);
      }
    }
  }

  /**
   * Account-archive hook (reset): cancel every PENDING transfer so no hold
   * outlives its account. The CALLER holds the account lock (lock order
   * account → transfer). Venue-side cancels were requested beforehand
   * (cancelPendingAtVenue); the sweep watches for late settlements.
   */
  async cancelPendingForAccount(tx: TxHandle, accountId: string): Promise<number> {
    const pending = await this.repo.listPendingForAccount(tx, accountId);
    let canceled = 0;
    for (const p of pending) {
      const locked = await this.repo.getByIdForUpdate(tx, p.id);
      if (!locked || locked.state !== "PENDING") continue;
      await this.repo.setState(tx, p.id, {
        state: "CANCELED",
        failureReason: RESET_CANCEL_REASON,
      });
      canceled += 1;
    }
    return canceled;
  }

  async getById(id: string): Promise<CashTransfer | null> {
    return this.txRunner.run((tx) => this.repo.getById(tx, id));
  }

  // -------------------------------------------------------------------------

  private async syncOne(
    transfer: CashTransfer,
    ref: BrokerAccountRef | null,
    listing: VenueTransferListing | null,
  ): Promise<CashTransferState> {
    const age = this.clock.now().getTime() - transfer.createdAt.getTime();
    const pastGrace = age > this.config.venueGraceMs;
    if (!ref) {
      if (!pastGrace) return transfer.state;
      return this.finish(transfer.id, "FAILED", "No venue account for this transfer");
    }

    if (transfer.venueTransferId) {
      const listed = listing?.transfers.find((t) => t.venueTransferId === transfer.venueTransferId);
      if (listed) return this.applyVenueState(transfer.id, listed);
      // Not in the listing (failed, incomplete, or outside its window): the
      // by-id lookup is authoritative — null means every page was read.
      const venueTransfer = await this.venue.getTransfer(ref, transfer.venueTransferId);
      if (venueTransfer) return this.applyVenueState(transfer.id, venueTransfer);
      if (!pastGrace) return transfer.state;
      return this.finish(transfer.id, "FAILED", "The venue has no record of this transfer");
    }

    // No venue id: initiate never answered (crash/timeout). Only past the
    // grace window — a younger row's venue call may still be in flight.
    // Look for the venue-side transfer before failing: a withdrawal the
    // venue executed must post, or the ledger would exceed venue cash.
    if (!pastGrace) return transfer.state;
    if (!listing) throw new Error("venue transfer listing unavailable; recovery deferred");
    const created = transfer.createdAt.getTime();
    const candidates = listing.transfers
      .filter(
        (c) =>
          c.direction === transfer.direction &&
          c.amount.equals(transfer.amount) &&
          Math.abs(c.createdAt.getTime() - created) <= RECOVERY_WINDOW_MS,
      )
      // closest in time first: the request that created it ran right after the insert
      .sort(
        (a, b) =>
          Math.abs(a.createdAt.getTime() - created) - Math.abs(b.createdAt.getTime() - created),
      );
    for (const c of candidates) {
      const linked = await this.txRunner.run((tx) =>
        this.repo.isVenueIdLinked(tx, c.venueTransferId),
      );
      if (linked) continue;
      return this.applyVenueState(transfer.id, c);
    }
    if (!listing.complete) {
      // The venue returned rows we could not read — one of them may be this
      // transfer. Failing it could let the ledger exceed venue cash: stay
      // PENDING (a withdrawal keeps its hold) and say so every pass.
      this.log(
        "error",
        "transfer recovery: venue listing incomplete; staying PENDING",
        transfer.id,
        null,
      );
      return transfer.state;
    }
    return this.finish(transfer.id, "FAILED", "The transfer never reached the venue");
  }

  /** Record the venue id and apply the venue's state, under the locks. */
  private async applyVenueState(
    transferId: string,
    venueTransfer: VenueTransfer,
  ): Promise<CashTransferState> {
    const current = await this.mustGet(transferId);
    const accountId = current.accountId;
    if (!current.venueTransferId) {
      // Committed on its own so the link survives even if settlement below
      // refuses (e.g. the negative-cash guard) and rolls back.
      await this.txRunner.run(async (tx) => {
        await this.accounts.lockForUpdate(tx, accountId);
        const t = await this.repo.getByIdForUpdate(tx, transferId);
        if (t && !t.venueTransferId) {
          await this.repo.setVenueTransferId(tx, transferId, venueTransfer.venueTransferId);
        }
      });
    }
    return this.txRunner.run(async (tx) => {
      const account = await this.accounts.lockForUpdate(tx, accountId);
      const transfer = await this.repo.getByIdForUpdate(tx, transferId);
      invariant(transfer, `transfer ${transferId} vanished`);
      if (transfer.state !== "PENDING") return transfer.state; // already terminal: no-op

      if (account.status !== "ACTIVE") {
        // Archived (reset) between creation and the venue's answer: the hook
        // normally cancels first; this is the belt for the braces. No money
        // posts to an archived account — but a venue settlement is never
        // dropped silently (operator ADJUSTMENT path, ADR-015).
        const settled = venueTransfer.state === "SETTLED";
        await this.repo.setState(tx, transfer.id, {
          state: "CANCELED",
          failureReason: settled ? VENUE_SETTLED_ANYWAY_REASON : INACTIVE_CANCEL_REASON,
        });
        if (settled) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "venue settled a transfer of an archived account — ledger and venue cash diverge; post an operator ADJUSTMENT (ADR-015)",
              transferId: transfer.id,
              accountId,
              venueTransferId: venueTransfer.venueTransferId,
              direction: transfer.direction,
              amount: transfer.amount.toString(),
            }),
          );
        }
        return "CANCELED";
      }

      // The venue's record must be the transfer we asked for — never settle
      // a different amount or direction than the one that was checked + held.
      invariant(
        venueTransfer.direction === transfer.direction &&
          venueTransfer.amount.equals(transfer.amount),
        `venue transfer ${venueTransfer.venueTransferId} (${venueTransfer.direction} ${venueTransfer.amount.toString()}) does not match ${transfer.id}`,
      );
      if (venueTransfer.state === "PENDING") return "PENDING";
      if (venueTransfer.state === "FAILED") {
        await this.repo.setState(tx, transfer.id, {
          state: "FAILED",
          failureReason: venueTransfer.failureReason ?? "Rejected by the venue",
        });
        return "FAILED";
      }
      await this.settleLocked(tx, account, transfer);
      return "SETTLED";
    });
  }

  /** SETTLED under the account + transfer locks: exactly one ledger entry. */
  private async settleLocked(
    tx: TxHandle,
    account: Account,
    transfer: CashTransfer,
  ): Promise<void> {
    invariant(canTransition(transfer.state, "SETTLED"), "settle: transfer not PENDING");
    let amount = transfer.amount;
    if (transfer.direction === "WITHDRAWAL") {
      // The hold guarantees this; if a fill overran its reservation, refuse
      // to drive cash negative — the transfer stays PENDING and the sweep
      // logs it every pass until an operator resolves it (ADR-015).
      invariant(
        account.cashBalance.gte(transfer.amount),
        `withdrawal ${transfer.id} of ${transfer.amount.toString()} exceeds cash ${account.cashBalance.toString()}`,
      );
      amount = transfer.amount.negate();
    }
    await this.getLedger().post(tx, {
      accountId: account.id,
      entryType: transfer.direction,
      amount,
      refType: LEDGER_REF_TYPE,
      refId: transfer.id,
      description: transfer.direction === "DEPOSIT" ? DEPOSIT_DESCRIPTION : WITHDRAWAL_DESCRIPTION,
    });
    await this.repo.setState(tx, transfer.id, { state: "SETTLED", settledAt: this.clock.now() });
  }

  /** PENDING → FAILED/CANCELED under the locks (no ledger effect). */
  private async finish(
    transferId: string,
    state: "FAILED" | "CANCELED",
    reason: string,
  ): Promise<CashTransferState> {
    const accountId = (await this.mustGet(transferId)).accountId;
    return this.txRunner.run(async (tx) => {
      await this.accounts.lockForUpdate(tx, accountId);
      const transfer = await this.repo.getByIdForUpdate(tx, transferId);
      invariant(transfer, `transfer ${transferId} vanished`);
      if (!canTransition(transfer.state, state)) return transfer.state;
      await this.repo.setState(tx, transferId, { state, failureReason: reason });
      return state;
    });
  }

  private async depositedInWindow(tx: TxHandle, account: Account): Promise<Money> {
    const since = new Date(this.clock.now().getTime() - this.config.limits.depositWindowMs);
    const transfers = await this.repo.sumDepositsSince(tx, account.id, since);
    // The opening deposit was a venue transfer too and counts toward the
    // venue's per-account daily cap.
    const opening =
      account.createdAt.getTime() >= since.getTime() ? account.startingCash : Money.zero();
    return transfers.add(opening);
  }

  private assertSameRequest(existing: CashTransfer, fingerprint: string): CashTransfer {
    if (existing.requestHash !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "This Idempotency-Key was already used for a different transfer",
        { subcode: "IDEMPOTENCY_CONFLICT" },
      );
    }
    return existing;
  }

  private async mustGet(id: string): Promise<CashTransfer> {
    const t = await this.txRunner.run((tx) => this.repo.getById(tx, id));
    invariant(t, `transfer ${id} not found`);
    return t;
  }

  private log(level: "warn" | "error", msg: string, id: string, detail: unknown): void {
    console.error(
      JSON.stringify({ level, msg, id, ...(detail != null ? { detail: String(detail) } : {}) }),
    );
  }
}

function emptySweep(): SweepResult {
  return {
    accountsChecked: 0,
    transfersChecked: 0,
    settled: 0,
    failed: 0,
    errors: 0,
    divergedAfterReset: 0,
  };
}
