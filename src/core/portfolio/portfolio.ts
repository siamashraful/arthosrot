import { Basis, Money, notional, Px, Qty } from "../money";
import type { MarketDataProvider } from "../market-data";
import { invariant, type TransactionRunner, type TxHandle } from "../shared";
import type { Position, PositionsRepository } from "./positions";

/**
 * Portfolio views: valuations always carry asOf (invariant 12); realized P&L
 * is DERIVED by replaying fills chronologically (average-cost) — provably
 * consistent with history rather than a mutable stored aggregate.
 */

export interface FillForReplay {
  instrumentId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: Qty;
  notional: Money;
  fee: Money;
  occurredAt: Date;
}

export interface FillsReplaySource {
  listForAccountChronological(tx: TxHandle, accountId: string): Promise<FillForReplay[]>;
}

export interface OpenSellReader {
  sumOpenSellRemaindersByInstrument(tx: TxHandle, accountId: string): Promise<Map<string, Qty>>;
  sumOpenBuyReservations(tx: TxHandle, accountId: string): Promise<Money>;
}

export interface PositionView {
  symbol: string;
  qty: string;
  sellableQty: string;
  avgCost: string; // 4dp
  lastPrice: string;
  marketValue: string;
  unrealizedPnl: string;
  quoteTs: string;
}

export interface PortfolioView {
  positions: PositionView[];
  summary: {
    equity: string;
    cash: string;
    buyingPower: string;
    positionsValue: string;
    realizedPnl: string;
    asOf: string;
  };
}

export class PortfolioService {
  constructor(
    private readonly positions: PositionsRepository,
    private readonly fills: FillsReplaySource,
    private readonly orders: OpenSellReader,
    private readonly txRunner: TransactionRunner,
    private readonly marketData: MarketDataProvider,
  ) {}

  /** Replay-derived realized P&L (average-cost), per invariant 12. */
  async realizedPnl(tx: TxHandle, accountId: string): Promise<Money> {
    const fills = await this.fills.listForAccountChronological(tx, accountId);
    const book = new Map<string, { qty: Qty; basis: Basis }>();
    let realized = Money.zero();
    for (const fill of fills) {
      const entry = book.get(fill.instrumentId) ?? { qty: Qty.of(0), basis: Basis.zero() };
      if (fill.side === "BUY") {
        entry.qty = entry.qty.add(fill.qty);
        entry.basis = entry.basis.addMoney(fill.notional).addMoney(fill.fee);
      } else {
        invariant(entry.qty.gte(fill.qty), "replay: sell exceeds held quantity");
        const { allocated, remaining } = entry.basis.allocate(fill.qty, entry.qty);
        realized = realized.add(fill.notional.subtract(fill.fee).subtract(allocated));
        entry.qty = entry.qty.subtract(fill.qty);
        entry.basis = remaining;
      }
      book.set(fill.instrumentId, entry);
    }
    return realized;
  }

  async view(accountId: string, cash: Money, now: Date): Promise<PortfolioView> {
    return this.txRunner.run(async (tx) => {
      const held = (await this.positions.listForAccount(tx, accountId)).filter((p) =>
        p.qty.isPositive(),
      );
      const symbols = held.map((p) => p.symbol);
      const quotes = symbols.length
        ? await this.marketData.getQuotes(symbols)
        : new Map<string, never>();
      // One grouped query for every open-sell remainder — not one per position.
      const openSells = held.length
        ? await this.orders.sumOpenSellRemaindersByInstrument(tx, accountId)
        : new Map<string, Qty>();

      let positionsValue = Money.zero();
      const positions: PositionView[] = [];
      for (const p of held) {
        const quote = quotes.get(p.symbol);
        const last: Px | null = quote?.last ?? null;
        const marketValue = last ? notional(last, p.qty) : null;
        if (marketValue) positionsValue = positionsValue.add(marketValue);
        const basisRounded = roundBasis(p);
        positions.push({
          symbol: p.symbol,
          qty: p.qty.toString(),
          sellableQty: p.qty.subtract(openSells.get(p.instrumentId) ?? Qty.of(0)).toString(),
          avgCost: p.costBasisTotal.avgPx(p.qty).toString(),
          lastPrice: last?.toString() ?? "",
          marketValue: marketValue?.toString() ?? "",
          unrealizedPnl: marketValue ? marketValue.subtract(basisRounded).toString() : "",
          quoteTs: quote?.ts.toISOString() ?? "",
        });
      }

      const reserved = await this.orders.sumOpenBuyReservations(tx, accountId);
      const realized = await this.realizedPnl(tx, accountId);

      return {
        positions,
        summary: {
          equity: cash.add(positionsValue).toString(),
          cash: cash.toString(),
          buyingPower: cash.subtract(reserved).toString(),
          positionsValue: positionsValue.toString(),
          realizedPnl: realized.toString(),
          asOf: now.toISOString(),
        },
      };
    });
  }
}

function roundBasis(p: Position): Money {
  // Basis is 4dp; the displayed unrealized P&L compares 2dp values.
  return p.costBasisTotal.allocate(p.qty, p.qty).allocated;
}
