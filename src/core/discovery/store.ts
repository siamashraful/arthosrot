/** Persistence port for ranking snapshots (append-only; newest wins). */
export interface StoredRankingEntry {
  rank: number;
  cik: string;
  symbol: string;
  name: string;
  /** Decimal strings — NUMERIC columns, never JS numbers. */
  shares: string;
  price: string;
  marketCap: string;
}

export interface StoredRanking {
  list: string;
  asOf: Date;
  source: string;
  entries: StoredRankingEntry[];
}

export interface MarketCapRankingStore {
  latest(list: string): Promise<StoredRanking | null>;
  save(snapshot: StoredRanking): Promise<void>;
}
