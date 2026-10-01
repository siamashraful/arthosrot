import type { AccountsRepository } from "../accounts";
import type { Broker } from "../execution";
import type { OrdersService } from "../orders";
import type { CanonicalBrokerEvent } from "../orders";
import type { LedgerService } from "../ledger";
import type { Clock, TransactionRunner, TxHandle } from "../shared";

/**
 * Reconciliation engine (docs/architecture/EXECUTION.md): the REST fallback
 * that makes stream ingestion safe to lose. For every local non-terminal
 * order it fetches venue truth and replays the venue's events through the
 * SAME idempotent apply path the stream uses — missed fills import exactly
 * once, stale states converge, nothing is ever double-applied, and snapshots
 * are never blindly copied over local history.
 */

export type ReconciliationStatus = "HEALTHY" | "STALE" | "RECONCILING" | "DRIFT_DETECTED" | "ERROR";

export interface ReconciliationResult {
  accountsChecked: number;
  ordersChecked: number;
  eventsReplayed: number;
  submitFailures: number;
  /** CANCEL_PENDING orders whose venue cancel was re-sent (lost or failed request). */
  cancelsResent: number;
  driftDetected: string[]; // account ids with cash-projection drift
  errors: string[];
  durationMs: number;
}

/** Extra read surface the engine needs beyond the module services. */
export interface ReconciliationReads {
  listActiveAccountIds(tx: TxHandle): Promise<string[]>;
  setReconciliationStatus(
    tx: TxHandle,
    accountId: string,
    status: ReconciliationStatus,
    at: Date,
  ): Promise<void>;
}

/** How long a PENDING_SUBMISSION may dangle before the venue-absence check
 *  declares it SUBMIT_FAILED (crash between local commit and submit). */
const PENDING_SUBMISSION_GRACE_MS = 60_000;

/** How long an order may sit in CANCEL_PENDING before the venue cancel is
 *  re-sent (the original request failed or was lost; cancel is idempotent
 *  at the venue — the outcome still arrives only as a canonical event). */
export const CANCEL_RESEND_AFTER_MS = 60_000;

/** Pre-cancel lifecycle statuses: they cannot follow a local CANCEL_PENDING. */
const PRE_CANCEL_EVENTS: ReadonlySet<CanonicalBrokerEvent["type"]> = new Set([
  "ORDER_ACKNOWLEDGED",
  "ORDER_ACCEPTED",
]);

export class ReconciliationService {
  constructor(
    private readonly broker: Broker,
    private readonly orders: OrdersService,
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
    private readonly reads: ReconciliationReads,
    private readonly applyEvent: (event: CanonicalBrokerEvent) => Promise<void>,
    private readonly txRunner: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async reconcileAll(): Promise<ReconciliationResult> {
    const startedAt = Date.now();
    const result: ReconciliationResult = {
      accountsChecked: 0,
      ordersChecked: 0,
      eventsReplayed: 0,
      submitFailures: 0,
      cancelsResent: 0,
      driftDetected: [],
      errors: [],
      durationMs: 0,
    };

    const accountIds = await this.txRunner.run((tx) => this.reads.listActiveAccountIds(tx));
    for (const accountId of accountIds) {
      try {
        await this.reconcileAccount(accountId, result);
        result.accountsChecked += 1;
      } catch (err) {
        result.errors.push(`${accountId}: ${String(err)}`);
        await this.txRunner.run((tx) =>
          this.reads.setReconciliationStatus(tx, accountId, "ERROR", this.clock.now()),
        );
      }
    }

    result.durationMs = Date.now() - startedAt;
    console.log(JSON.stringify({ level: "info", msg: "reconciliation", ...result }));
    return result;
  }

  /**
   * Reconcile ONE account now (same rules as reconcileAll) — used when a
   * live action learns local state is behind the venue (e.g. a cancel the
   * venue refused because the order already filled), so the user sees the
   * truth immediately instead of at the next scheduled pass.
   */
  async reconcileAccountNow(accountId: string): Promise<ReconciliationResult> {
    const startedAt = Date.now();
    const result: ReconciliationResult = {
      accountsChecked: 0,
      ordersChecked: 0,
      eventsReplayed: 0,
      submitFailures: 0,
      cancelsResent: 0,
      driftDetected: [],
      errors: [],
      durationMs: 0,
    };
    try {
      await this.reconcileAccount(accountId, result);
      result.accountsChecked = 1;
    } catch (err) {
      result.errors.push(`${accountId}: ${String(err)}`);
      await this.txRunner.run((tx) =>
        this.reads.setReconciliationStatus(tx, accountId, "ERROR", this.clock.now()),
      );
    }
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  /**
   * A local cancel intent the venue never acted on (request failed or lost)
   * would leave the order CANCEL_PENDING forever: past the threshold, ask
   * the venue again. Never changes state itself.
   */
  private async resendCancelIfStuck(
    orderId: string,
    brokerAccountId: string,
    result: ReconciliationResult,
  ): Promise<void> {
    const current = await this.txRunner.run((tx) => this.orders.getById(tx, orderId));
    if (current?.state !== "CANCEL_PENDING") return; // replay resolved it
    const age = this.clock.now().getTime() - current.updatedAt.getTime();
    if (age <= CANCEL_RESEND_AFTER_MS) return;
    const outcome = await this.broker.cancel(brokerAccountId, orderId);
    result.cancelsResent += 1;
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "re-sent venue cancel for a stuck CANCEL_PENDING order",
        orderId,
        accepted: outcome.accepted,
        ...(outcome.reason ? { reason: outcome.reason } : {}),
      }),
    );
  }

  private async reconcileAccount(accountId: string, result: ReconciliationResult): Promise<void> {
    const ref = await this.txRunner.run((tx) => this.accounts.getBrokerAccount(tx, accountId));
    if (!ref) return;

    await this.txRunner.run((tx) =>
      this.reads.setReconciliationStatus(tx, accountId, "RECONCILING", this.clock.now()),
    );

    const openOrders = await this.txRunner.run((tx) => this.orders.list(tx, accountId, true));
    for (const order of openOrders) {
      result.ordersChecked += 1;
      const snapshot = await this.broker.getOrderByClientId(ref.externalAccountId, order.id);

      if (!snapshot) {
        // Venue provably never received it: SUBMIT_FAILED — but only for
        // PENDING_SUBMISSION past the grace window (EXECUTION.md note 2).
        const age = this.clock.now().getTime() - order.createdAt.getTime();
        if (order.state === "PENDING_SUBMISSION" && age > PENDING_SUBMISSION_GRACE_MS) {
          await this.applyEvent({
            type: "ORDER_SUBMIT_FAILED",
            broker: this.broker.kind,
            brokerAccountId: ref.externalAccountId,
            brokerOrderId: null,
            clientOrderId: order.id,
            externalEventId: `recon-submit-failed-${order.id}`,
            occurredAt: this.clock.now(),
          });
          result.submitFailures += 1;
        }
        continue;
      }

      // Replay venue events through the idempotent apply path — already-seen
      // executions/events commit as no-ops (invariants 10/15). While we are
      // CANCEL_PENDING, a venue status that still says "new/accepted" is not
      // a transition (it cannot legally follow our cancel intent): it means
      // the venue has not seen the cancel — handled by the re-send below.
      // Fills and terminal outcomes always apply.
      const cancelling = order.state === "CANCEL_PENDING";
      for (const event of snapshot.events) {
        if (cancelling && PRE_CANCEL_EVENTS.has(event.type)) continue;
        await this.applyEvent(event);
        result.eventsReplayed += 1;
      }

      if (cancelling) await this.resendCancelIfStuck(order.id, ref.externalAccountId, result);
    }

    // Invariant 6: cash projection vs ledger. Snapshot comparison is a
    // reference — discrepancies are logged, never blindly copied.
    const { drift, status } = await this.txRunner.run(async (tx) => {
      const rec = await this.ledger.reconcile(tx, accountId);
      const status: ReconciliationStatus = rec.inBalance ? "HEALTHY" : "DRIFT_DETECTED";
      await this.reads.setReconciliationStatus(tx, accountId, status, this.clock.now());
      return { drift: rec.drift, status };
    });
    if (status === "DRIFT_DETECTED") {
      result.driftDetected.push(accountId);
      console.error(
        JSON.stringify({
          level: "error",
          msg: "cash projection drift (invariant 6)",
          accountId,
          drift: drift.toString(),
        }),
      );
    }
  }
}
