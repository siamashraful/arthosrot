/**
 * core/portfolio — positions (average-cost), portfolio views, replay-derived
 * realized P&L (invariant 12).
 */
export {
  applyBuyFill,
  applySellFill,
  type BuyApplication,
  type Position,
  type PositionsRepository,
  type SellApplication,
} from "./positions";
export {
  PortfolioService,
  type FillForReplay,
  type FillsReplaySource,
  type OpenSellReader,
  type PortfolioView,
  type PositionView,
} from "./portfolio";
