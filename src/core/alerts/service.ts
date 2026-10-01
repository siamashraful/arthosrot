import type { MarketDataProvider, MarketStatus, Quote } from "../market-data";
import type { Px } from "../money";
import { AppError, type Clock, type TransactionRunner, type TxHandle } from "../shared";
import {
  ALERT_MAX_QUOTE_AGE_MS,
  checkActiveAlertLimit,
  evaluateAlert,
  MAX_ACTIVE_ALERTS_PER_USER,
  type AlertDirection,
  type AlertState,
} from "./rules";

/**
 * Price alerts (ADR-016): per-user, one-shot "price goes above/below X"
 * notifications, evaluated by a scheduled worker job and opportunistically on
 * the user's own reads. In-app only (email is a later channel).
 *
 * Correctness rules:
 * - Creation runs under a per-user transaction lock, so the active-alert cap
 *   and the duplicate check can't be raced; a partial UNIQUE index on the
 *   ACTIVE terms is the structural backstop.
 * - Triggering is a CONDITIONAL update (`WHERE id = ? AND state = 'ACTIVE'`):
 *   two evaluations racing on one alert — two job ticks, or the job and a
 *   user's GET — trigger it exactly once; the loser's update matches no row.
 * - The trigger price/time are what the quote said at evaluation; they are
 *   written once and never recomputed.
 * - Display data only: an alert never places an order or touches money.
 */

export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  direction: AlertDirection;
  threshold: Px;
  state: AlertState;
  createdAt: Date;
  triggeredAt: Date | null;
  triggerPrice: Px | null;
  /** The triggering quote's own observation time. */
  triggerQuoteAt: Date | null;
  readAt: Date | null;
  canceledAt: Date | null;
}

export interface NewPriceAlert {
  userId: string;
  symbol: string;
  direction: AlertDirection;
  threshold: Px;
}

export interface PriceAlertsRepository {
  /** Serialize alert creation per user (transaction-scoped lock). */
  lockUser(tx: TxHandle, userId: string): Promise<void>;
  countActive(tx: TxHandle, userId: string): Promise<number>;
  findActiveDuplicate(tx: TxHandle, input: NewPriceAlert): Promise<PriceAlert | null>;
  /** Insert ACTIVE; null when an identical ACTIVE alert already exists. */
  insert(tx: TxHandle, input: NewPriceAlert): Promise<PriceAlert | null>;
  getByIdForUpdate(tx: TxHandle, id: string): Promise<PriceAlert | null>;
  /** ACTIVE + TRIGGERED (never CANCELED), newest first. */
  listForUser(tx: TxHandle, userId: string, limit: number): Promise<PriceAlert[]>;
  listActiveForUser(tx: TxHandle, userId: string): Promise<PriceAlert[]>;
  listActiveSymbols(tx: TxHandle): Promise<string[]>;
  listActiveForSymbols(tx: TxHandle, symbols: readonly string[]): Promise<PriceAlert[]>;
  /** ACTIVE → TRIGGERED iff still ACTIVE; null when another evaluation (or a delete) won. */
  markTriggered(
    tx: TxHandle,
    id: string,
    facts: { price: Px; quoteAt: Date; at: Date },
  ): Promise<PriceAlert | null>;
  /** ACTIVE | TRIGGERED → CANCELED; null when already CANCELED. */
  cancel(tx: TxHandle, id: string, at: Date): Promise<PriceAlert | null>;
  /** Stamp read_at on the user's unread TRIGGERED alerts (all, or only `ids`). */
  markRead(tx: TxHandle, userId: string, at: Date, ids?: readonly string[]): Promise<number>;
  countUnread(tx: TxHandle, userId: string): Promise<number>;
}

/** The slice of the market-data port alerts need (the cached provider in production). */
export type AlertQuoteSource = Pick<MarketDataProvider, "getQuotes" | "getMarketStatus">;

export interface PriceAlertsConfig {
  maxActivePerUser: number;
  maxQuoteAgeMs: number;
  /** Rows returned by the list (ACTIVE ≤ cap, plus recent TRIGGERED history). */
  listLimit: number;
  /** Symbols per getQuotes call in the job. */
  quoteBatchSize: number;
}

export const DEFAULT_PRICE_ALERTS_CONFIG: PriceAlertsConfig = {
  maxActivePerUser: MAX_ACTIVE_ALERTS_PER_USER,
  maxQuoteAgeMs: ALERT_MAX_QUOTE_AGE_MS,
  listLimit: 200,
  quoteBatchSize: 100,
};

export interface AlertEvaluationResult {
  marketStatus: MarketStatus | null;
  symbols: number;
  checked: number;
  triggered: number;
  stale: number;
  errors: number;
}

export class PriceAlertService {
  constructor(
    private readonly repo: PriceAlertsRepository,
    private readonly quotes: AlertQuoteSource,
    private readonly txRunner: TransactionRunner,
    private readonly clock: Clock,
    private readonly config: PriceAlertsConfig = DEFAULT_PRICE_ALERTS_CONFIG,
  ) {}

  /**
   * Create an ACTIVE alert. An identical ACTIVE alert (same symbol,
   * direction and threshold) is returned as-is with `created: false` —
   * idempotent, never a second row. The symbol must already be validated
   * (instrument exists and is active) by the caller.
   */
  async create(input: NewPriceAlert): Promise<{ alert: PriceAlert; created: boolean }> {
    return this.txRunner.run(async (tx) => {
      await this.repo.lockUser(tx, input.userId);
      const existing = await this.repo.findActiveDuplicate(tx, input);
      if (existing) return { alert: existing, created: false };
      checkActiveAlertLimit(
        await this.repo.countActive(tx, input.userId),
        this.config.maxActivePerUser,
      );
      const inserted = await this.repo.insert(tx, input);
      if (inserted) return { alert: inserted, created: true };
      // Unreachable under the user lock; the partial UNIQUE index still wins.
      const raced = await this.repo.findActiveDuplicate(tx, input);
      if (!raced) throw new AppError("CONFLICT", "The alert could not be created. Try again.");
      return { alert: raced, created: false };
    });
  }

  /** The user's alerts (ACTIVE + TRIGGERED, newest first) and unread count. */
  async list(userId: string): Promise<{ alerts: PriceAlert[]; unreadCount: number }> {
    return this.txRunner.run(async (tx) => ({
      alerts: await this.repo.listForUser(tx, userId, this.config.listLimit),
      unreadCount: await this.repo.countUnread(tx, userId),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.txRunner.run((tx) => this.repo.countUnread(tx, userId));
  }

  /** Soft delete. Someone else's (or an unknown, or already deleted) alert is NOT_FOUND. */
  async cancel(userId: string, alertId: string): Promise<PriceAlert> {
    return this.txRunner.run(async (tx) => {
      const alert = await this.repo.getByIdForUpdate(tx, alertId);
      if (!alert || alert.userId !== userId || alert.state === "CANCELED") {
        throw new AppError("NOT_FOUND", "Alert not found");
      }
      const canceled = await this.repo.cancel(tx, alertId, this.clock.now());
      if (!canceled) throw new AppError("NOT_FOUND", "Alert not found");
      return canceled;
    });
  }

  async markRead(userId: string, ids?: readonly string[]): Promise<number> {
    return this.txRunner.run((tx) => this.repo.markRead(tx, userId, this.clock.now(), ids));
  }

  /**
   * Opportunistic evaluation of ONE user's ACTIVE alerts (their GET), so
   * alerts fire in local/dev without the worker. Never throws: a provider
   * failure is logged and the read still renders.
   */
  async evaluateForUser(userId: string): Promise<AlertEvaluationResult> {
    const out = emptyResult();
    try {
      const active = await this.txRunner.run((tx) => this.repo.listActiveForUser(tx, userId));
      if (active.length === 0) return out;
      const symbols = [...new Set(active.map((a) => a.symbol))];
      out.symbols = symbols.length;
      const market = await this.quotes.getMarketStatus();
      out.marketStatus = market.status;
      if (market.status !== "OPEN") return out; // nothing can trigger off-session
      const quotes = await this.quotes.getQuotes(symbols);
      await this.evaluateBatch(active, quotes, market.status, out);
    } catch (err) {
      out.errors += 1;
      this.log("warn", "alert evaluation (read) failed", userId, err);
    }
    return out;
  }

  /**
   * The scheduled job: every symbol with an ACTIVE alert, batched into the
   * quote source. Throws only when no quote batch could be fetched at all,
   * so the job registry records the failure and retries next tick.
   */
  async evaluateAll(): Promise<AlertEvaluationResult> {
    const out = emptyResult();
    const symbols = await this.txRunner.run((tx) => this.repo.listActiveSymbols(tx));
    out.symbols = symbols.length;
    if (symbols.length === 0) return out;
    const market = await this.quotes.getMarketStatus();
    out.marketStatus = market.status;
    if (market.status !== "OPEN") return out;

    let fetchedBatches = 0;
    let lastError: unknown = null;
    for (let i = 0; i < symbols.length; i += this.config.quoteBatchSize) {
      const batch = symbols.slice(i, i + this.config.quoteBatchSize);
      let quotes: Map<string, Quote>;
      try {
        quotes = await this.quotes.getQuotes(batch);
        fetchedBatches += 1;
      } catch (err) {
        out.errors += 1;
        lastError = err;
        this.log("error", "alert evaluation: quote batch failed", batch.join(","), err);
        continue;
      }
      const alerts = await this.txRunner.run((tx) => this.repo.listActiveForSymbols(tx, batch));
      await this.evaluateBatch(alerts, quotes, market.status, out);
    }
    if (fetchedBatches === 0) {
      throw new Error(`price alerts: no quotes available (${String(lastError)})`);
    }
    return out;
  }

  // -------------------------------------------------------------------------

  private async evaluateBatch(
    alerts: readonly PriceAlert[],
    quotes: Map<string, Quote>,
    marketStatus: MarketStatus,
    out: AlertEvaluationResult,
  ): Promise<void> {
    const now = this.clock.now();
    for (const alert of alerts) {
      out.checked += 1;
      const verdict = evaluateAlert(alert, quotes.get(alert.symbol) ?? null, {
        now,
        marketStatus,
        maxQuoteAgeMs: this.config.maxQuoteAgeMs,
      });
      if (verdict.kind === "HOLD") {
        if (verdict.reason === "STALE_QUOTE") out.stale += 1;
        continue;
      }
      try {
        const won = await this.txRunner.run((tx) =>
          this.repo.markTriggered(tx, alert.id, {
            price: verdict.price,
            quoteAt: verdict.quoteAt,
            at: now,
          }),
        );
        if (won) out.triggered += 1;
      } catch (err) {
        out.errors += 1;
        this.log("error", "alert trigger failed", alert.id, err);
      }
    }
  }

  private log(level: "warn" | "error", msg: string, id: string, err: unknown): void {
    console.error(JSON.stringify({ level, msg, id, err: String(err) }));
  }
}

function emptyResult(): AlertEvaluationResult {
  return { marketStatus: null, symbols: 0, checked: 0, triggered: 0, stale: 0, errors: 0 };
}
