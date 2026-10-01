/**
 * core/discovery — what the Markets screen offers before a search: the sector
 * catalog and the Top-100-by-market-value ranking (pure ranking rules; the
 * SEC source and the snapshot store are ports implemented in infra).
 */
export {
  EXCLUDED_SIC,
  isDepositaryReceipt,
  rankByMarketCap,
  validateSnapshot,
  type RankedCompany,
  type RankInput,
  type RankResult,
  type ShareCount,
  type ShareOverride,
  type SharesOutstandingSource,
  type SnapshotVerdict,
} from "./ranking";
export { SHARE_OVERRIDES } from "./share-overrides";
export { displayCompanyName } from "./names";
export { SECTORS, TOP100_LIST, TOP100_SEED, type Sector, type SectorIcon } from "./catalog";
export {
  fiftyTwoWeekRange,
  priceToEarnings,
  trailingEps,
  type EarningsSource,
  type EpsFact,
  type TrailingEps,
} from "./fundamentals";
export type { MarketCapRankingStore, StoredRanking, StoredRankingEntry } from "./store";
export { compareDecimal, MOVERS_LIMIT, rankMovers, type MoverCandidate } from "./movers";
export { downsampleSeries, SPARKLINE_MAX_POINTS } from "./sparkline";
