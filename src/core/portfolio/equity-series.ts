import { type Candle, type CandleRange, ProviderUnavailableError } from "../market-data";
import { Money, notional, percentChange, Px, Qty } from "../money";
import type { FillForReplay } from "./portfolio";

/**
 * Net-worth (equity) time series, DERIVED on read from the facts we already
 * trust: cumulative ledger cash + a chronological fill replay, valued at
 * cached candle closes. Nothing is persisted; nothing is fabricated.
 *
 * Sampling rule (the correctness heart of this module): a candle's `time` is
 * the BAR START, but its close is an end-of-bar price — so holdings and cash
 * are sampled at the bar's END (`< barStart + barDuration`). Sampling at the
 * start would value a day's trades at a price epoch they hadn't reached.
 *
 * Honesty rules:
 * - A symbol that is HELD at a grid point but has no known price by then
 *   fails the whole series (ProviderUnavailableError). A net worth that
 *   silently omits one holding is fabricated, which is worse than no chart.
 * - The series covers the ACTIVE account only; a reset starts the chart
 *   fresh (archived history stays on the Activity page — invariant 14).
 * - All arithmetic is decimal (Money/Px/Qty). Float conversion happens only
 *   at the chart-rendering boundary (FINANCIAL_INVARIANTS.md).
 */

export interface LedgerAmountAt {
  amount: Money;
  createdAt: Date;
}

export interface EquityPoint {
  t: Date;
  value: Money;
}

export interface EquitySeriesResult {
  points: EquityPoint[];
  change: { absolute: Money; percent: string | null };
}

/** Bar durations per range — must match the providers' timeframes. */
export const BAR_DURATION_MS: Record<CandleRange, number> = {
  "1D": 5 * 60_000,
  "1W": 60 * 60_000,
  "1M": 24 * 60 * 60_000,
  "3M": 24 * 60 * 60_000,
  "1Y": 24 * 60 * 60_000,
  "5Y": 7 * 24 * 60 * 60_000,
};

/** Window lookbacks per range — mirror the Alpaca adapter's request windows. */
export const RANGE_LOOKBACK_MS: Record<CandleRange, number> = {
  "1D": 1 * 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 31 * 24 * 60 * 60_000,
  "3M": 93 * 24 * 60 * 60_000,
  "1Y": 366 * 24 * 60 * 60_000,
  "5Y": 5 * 366 * 24 * 60 * 60_000,
};

/** Smallest provider range whose lookback covers the account's age (ALL). */
export function resolveAllRange(accountCreatedAt: Date, now: Date): CandleRange {
  const age = now.getTime() - accountCreatedAt.getTime();
  const order: CandleRange[] = ["1W", "1M", "3M", "1Y", "5Y"];
  for (const range of order) {
    if (RANGE_LOOKBACK_MS[range] >= age) return range;
  }
  return "5Y";
}

export interface EquitySeriesInput {
  range: CandleRange;
  /** Ascending by occurredAt (fillsReplaySource.listForAccountChronological). */
  fills: FillForReplay[];
  /** Ascending by createdAt; amounts signed (ledger convention). */
  ledger: LedgerAmountAt[];
  accountCreatedAt: Date;
  now: Date;
  /** The live final point — portfolioService.view()'s equity at `now`. */
  liveEquity: Money;
  getCandles: (symbol: string) => Promise<Candle[]>;
}

export async function equitySeries(input: EquitySeriesInput): Promise<EquitySeriesResult> {
  const { range, fills, ledger, accountCreatedAt, now, liveEquity, getCandles } = input;
  const barMs = BAR_DURATION_MS[range];
  const windowStart = new Date(
    Math.max(now.getTime() - RANGE_LOOKBACK_MS[range], accountCreatedAt.getTime()),
  );

  // Symbols that matter: held at window start, or traded inside the window.
  // A position fully round-tripped before the window never needs a price.
  const involved = involvedSymbols(fills, windowStart);

  const candlesBySymbol = new Map<string, Candle[]>();
  await Promise.all(
    [...involved].map(async (symbol) => {
      const candles = await getCandles(symbol);
      if (candles.length === 0) {
        throw new ProviderUnavailableError(`no candles for held symbol ${symbol}`);
      }
      candlesBySymbol.set(symbol, candles);
    }),
  );

  // Grid: union of bar starts across symbols, clipped to the window and the
  // account's existence. Cash-only accounts get a grid of their own ledger
  // events so the flat line still tells the true story.
  let grid = [
    ...new Set([...candlesBySymbol.values()].flatMap((cs) => cs.map((c) => Date.parse(c.time)))),
  ]
    .filter(
      (t) =>
        t >= windowStart.getTime() - barMs &&
        t + barMs > accountCreatedAt.getTime() &&
        // a bar still open at `now` is PARTIAL — decided HERE, before the
        // fallback choice, or a young account whose only surviving bar is
        // partial collapses to a single live point despite having ledger
        // history to draw
        t + barMs < now.getTime(),
    )
    .sort((a, b) => a - b);
  let gridBarMs = barMs;
  if (grid.length === 0) {
    grid = [
      ...new Set(
        ledger
          .map((e) => e.createdAt.getTime())
          .filter((t) => t >= windowStart.getTime() && t < now.getTime()),
      ),
    ].sort((a, b) => a - b);
    gridBarMs = 0; // ledger timestamps ARE event ends — sample inclusively
  }

  // Per-symbol close lookup by bar start, plus a seed price: the last close
  // at-or-before the first grid point, so a position held at the window edge
  // is priced from the moment the series begins.
  const closeAt = new Map<string, Map<number, Px>>();
  const carry = new Map<string, Px>();
  const firstGridEnd = grid.length > 0 ? grid[0]! + gridBarMs : 0;
  for (const [symbol, candles] of candlesBySymbol) {
    const bySlot = new Map<number, Px>();
    for (const c of candles) {
      const t = Date.parse(c.time);
      bySlot.set(t, Px.fromString(c.close));
      if (t + barMs <= firstGridEnd) {
        // candles ascend, so the LAST one ending at/before the first grid
        // point wins — the seed for a position held at the window edge
        carry.set(symbol, Px.fromString(c.close));
      }
    }
    closeAt.set(symbol, bySlot);
  }

  // Single ascending walk: cash from the ledger, the book from fills, both
  // cut at each bar's END so holdings and close share one instant.
  const points: EquityPoint[] = [];
  const book = new Map<string, Qty>();
  let cash = Money.zero();
  let fillIdx = 0;
  let ledgerIdx = 0;
  for (const barStart of grid) {
    // event grids (gridBarMs 0) sample inclusively: the event IS the bar end
    const cutoff = gridBarMs > 0 ? barStart + gridBarMs : barStart + 1;
    while (ledgerIdx < ledger.length && ledger[ledgerIdx]!.createdAt.getTime() < cutoff) {
      cash = cash.add(ledger[ledgerIdx]!.amount);
      ledgerIdx += 1;
    }
    while (fillIdx < fills.length && fills[fillIdx]!.occurredAt.getTime() < cutoff) {
      const fill = fills[fillIdx]!;
      const held = book.get(fill.symbol) ?? Qty.of(0);
      book.set(fill.symbol, fill.side === "BUY" ? held.add(fill.qty) : held.subtract(fill.qty));
      fillIdx += 1;
    }

    let value = cash;
    for (const [symbol, qty] of book) {
      if (!qty.isPositive()) continue;
      const close = closeAt.get(symbol)?.get(barStart) ?? carry.get(symbol);
      if (!close) {
        throw new ProviderUnavailableError(
          `held symbol ${symbol} has no price at ${new Date(barStart).toISOString()}`,
        );
      }
      carry.set(symbol, close);
      value = value.add(notional(close, qty));
    }
    // refresh carries even for symbols not currently held (cheap, keeps seeds warm)
    for (const [symbol, bySlot] of closeAt) {
      const c = bySlot.get(barStart);
      if (c) carry.set(symbol, c);
    }
    points.push({ t: new Date(barStart + gridBarMs), value });
  }

  // The live tail: today's equity as the venue and ledger currently know it.
  // Bars whose END is at/after `now` are PARTIAL — their close is "so far",
  // not a settled fact — so they yield to the live point instead of standing
  // beside it (which would also break the series' ascending order).
  while (points.length > 0 && points[points.length - 1]!.t.getTime() >= now.getTime()) {
    points.pop();
  }
  points.push({ t: now, value: liveEquity });

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  return {
    points,
    change: { absolute: last.subtract(first), percent: percentChange(first, last) },
  };
}

function involvedSymbols(fills: FillForReplay[], windowStart: Date): Set<string> {
  const held = new Map<string, Qty>();
  const involved = new Set<string>();
  for (const fill of fills) {
    const qty = held.get(fill.symbol) ?? Qty.of(0);
    held.set(fill.symbol, fill.side === "BUY" ? qty.add(fill.qty) : qty.subtract(fill.qty));
    if (fill.occurredAt.getTime() >= windowStart.getTime()) involved.add(fill.symbol);
  }
  // held at (or across) the window start
  const heldNow = new Map<string, Qty>();
  for (const fill of fills) {
    if (fill.occurredAt.getTime() >= windowStart.getTime()) break;
    const qty = heldNow.get(fill.symbol) ?? Qty.of(0);
    heldNow.set(fill.symbol, fill.side === "BUY" ? qty.add(fill.qty) : qty.subtract(fill.qty));
  }
  for (const [symbol, qty] of heldNow) if (qty.isPositive()) involved.add(symbol);
  return involved;
}
