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
export type { MarketCapRankingStore, StoredRanking, StoredRankingEntry } from "./store";
