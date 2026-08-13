import { Basis, Money, Qty } from "../money";
import { invariant, type TxHandle } from "../shared";

/**
 * Position bookkeeping (average-cost method). Applied ONLY inside the
 * ExecutionService fill transaction — never from market data (invariant 13).
 */

export interface Position {
  accountId: string;
  instrumentId: string;
  symbol: string;
  qty: Qty;
  costBasisTotal: Basis;
}

export interface PositionsRepository {
  getForUpdate(tx: TxHandle, accountId: string, instrumentId: string): Promise<Position | null>;
  upsert(tx: TxHandle, position: Position): Promise<void>;
  listForAccount(tx: TxHandle, accountId: string): Promise<Position[]>;
  getQty(tx: TxHandle, accountId: string, instrumentId: string): Promise<Qty>;
}

export interface BuyApplication {
  position: Position;
}

export interface SellApplication {
  position: Position;
  /** Cost basis allocated to the sold shares (average-cost). */
  allocatedBasis: Money;
  /** proceeds - fee - allocatedBasis. */
  realizedPnl: Money;
}

export function applyBuyFill(
  current: Position | null,
  meta: { accountId: string; instrumentId: string; symbol: string },
  fillQty: Qty,
  notionalAmount: Money,
  fee: Money,
): BuyApplication {
  const qty = (current?.qty ?? Qty.of(0)).add(fillQty);
  // Buy fees capitalize into the basis; sell fees reduce proceeds.
  const costBasisTotal = (current?.costBasisTotal ?? Basis.zero())
    .addMoney(notionalAmount)
    .addMoney(fee);
  return { position: { ...meta, qty, costBasisTotal } };
}

export function applySellFill(
  current: Position | null,
  fillQty: Qty,
  proceeds: Money,
  fee: Money,
): SellApplication {
  invariant(current, "sell fill against a non-existent position (invariant 3)");
  invariant(current.qty.gte(fillQty), "sell fill exceeds held quantity (invariant 3)");
  const { allocated, remaining } = current.costBasisTotal.allocate(fillQty, current.qty);
  const position: Position = {
    ...current,
    qty: current.qty.subtract(fillQty),
    costBasisTotal: remaining,
  };
  const realizedPnl = proceeds.subtract(fee).subtract(allocated);
  return { position, allocatedBasis: allocated, realizedPnl };
}
