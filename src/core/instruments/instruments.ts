import type { InstrumentSummary, MarketDataProvider } from "../market-data";
import { UnknownSymbolError } from "../market-data";
import { AppError } from "../shared/errors";
import type { TransactionRunner, TxHandle } from "../shared";

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  status: string;
}

export interface InstrumentsRepository {
  upsert(tx: TxHandle, summary: InstrumentSummary): Promise<Instrument>;
  getBySymbol(tx: TxHandle, symbol: string): Promise<Instrument | null>;
  search(tx: TxHandle, query: string, limit: number): Promise<Instrument[]>;
}

/**
 * Instrument search is DB-backed (seeded reference data); the provider's
 * search supplements it where the feed offers one (ADR-007).
 */
export class InstrumentService {
  constructor(
    private readonly repo: InstrumentsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly marketData: MarketDataProvider,
  ) {}

  async search(query: string): Promise<Instrument[]> {
    const q = query.trim();
    if (!q) return [];
    const fromProvider = await this.marketData.search(q);
    return this.txRunner.run(async (tx) => {
      for (const summary of fromProvider) {
        await this.repo.upsert(tx, summary);
      }
      return this.repo.search(tx, q, 10);
    });
  }

  /**
   * Resolve a symbol to an instrument. Unknown-but-quotable symbols are
   * registered on first sight (name falls back to the symbol until better
   * reference data exists).
   */
  async getOrRegister(symbol: string): Promise<Instrument> {
    const sym = symbol.trim().toUpperCase();
    const existing = await this.txRunner.run((tx) => this.repo.getBySymbol(tx, sym));
    if (existing) return existing;

    try {
      await this.marketData.getQuote(sym);
    } catch (err) {
      if (err instanceof UnknownSymbolError) {
        throw new AppError("NOT_FOUND", `Unknown symbol: ${sym}`, { subcode: "UNKNOWN_SYMBOL" });
      }
      throw err;
    }
    return this.txRunner.run((tx) =>
      this.repo.upsert(tx, { symbol: sym, name: sym, exchange: "UNKNOWN" }),
    );
  }
}
