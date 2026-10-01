import {
  fiftyTwoWeekRange,
  priceToEarnings,
  trailingEps,
  type EarningsSource,
} from "@/core/discovery";
import { UnknownSymbolError } from "@/core/market-data";
import { notional, Qty } from "@/core/money";
import { systemClock } from "@/core/shared";
import { env } from "@/env";
import { companyFundamentals } from "@/infra/db/repositories/company-fundamentals";
import { SecEdgarShares } from "@/infra/sec-edgar";
import { getContainer } from "../container";
import { symbolSchema } from "./market";

/**
 * Instrument key stats: market cap, P/E (TTM), 52-week high/low. Display
 * data with its sources stated — never an input to execution.
 *
 * - Market cap = SEC shares outstanding (daily job) × the live last price.
 * - P/E = live last ÷ trailing EPS; EPS is fetched from SEC on first view and
 *   cached a day per company (needs SEC_USER_AGENT; without it the cached
 *   value serves, or none).
 * - 52-week range = IEX daily bars over the last 365 days, widened by the
 *   live last price.
 */

const EPS_TTL_MS = 24 * 3_600_000;

function earningsSource(): EarningsSource | null {
  const ua = env().SEC_USER_AGENT;
  return ua ? new SecEdgarShares(ua) : null;
}

export async function getInstrumentStats(symbolRaw: string): Promise<unknown> {
  const symbol = symbolSchema.parse(symbolRaw).toUpperCase();
  const { marketData } = getContainer();
  const now = systemClock.now();
  const missing = (err: unknown) => {
    if (err instanceof UnknownSymbolError) return null;
    throw err;
  };
  const [quote, candles, fundamentals] = await Promise.all([
    marketData.getQuote(symbol).catch(missing),
    marketData.getCandles(symbol, "1Y").catch(missing),
    companyFundamentals.get(symbol),
  ]);

  let eps =
    fundamentals?.epsTtm && fundamentals.epsBasis && fundamentals.epsPeriodEnd
      ? {
          eps: fundamentals.epsTtm,
          basis: fundamentals.epsBasis,
          periodEnd: fundamentals.epsPeriodEnd,
        }
      : null;
  const source = earningsSource();
  const stale =
    !fundamentals?.epsCheckedAt || now.getTime() - fundamentals.epsCheckedAt.getTime() > EPS_TTL_MS;
  if (fundamentals && source && stale) {
    try {
      const facts = await source.epsHistory(fundamentals.cik);
      eps = facts ? trailingEps(facts, now) : null;
      await companyFundamentals.saveEps(fundamentals.cik, eps, now);
    } catch (err) {
      // SEC down: serve whatever was cached; stats are never worth an error page
      console.error(
        JSON.stringify({ level: "error", msg: "eps refresh failed", symbol, err: String(err) }),
      );
    }
  }

  const last = quote?.last ?? null;
  const marketCap =
    fundamentals && last ? notional(last, Qty.of(fundamentals.shares.toString())).toString() : null;
  const pe = eps && last ? priceToEarnings(last, eps.eps) : null;
  const range = candles ? fiftyTwoWeekRange(candles, now, last) : null;

  return {
    symbol,
    marketCap,
    sharesAsOf: fundamentals?.sharesAsOf ?? null,
    pe,
    peBasis: pe && eps ? eps.basis : null,
    epsPeriodEnd: eps?.periodEnd ?? null,
    /** EPS exists but is ≤ 0 — the UI says "n/m", not a blank. */
    peNotMeaningful: Boolean(eps && last && pe === null),
    week52: range ? { high: range.high.toString(), low: range.low.toString() } : null,
  };
}
