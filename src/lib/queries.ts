import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Shared query definitions: one key + fetcher + cadence per endpoint, so two
 * screens never cache the same data under different rules. Screens spread
 * these and add only screen-specific options (`enabled`, `select`).
 */
export const queries = {
  me: () => queryOptions({ queryKey: ["me"], queryFn: api.me }),
  portfolio: () =>
    queryOptions({ queryKey: ["portfolio"], queryFn: api.portfolio, refetchInterval: 30_000 }),
  watchlist: () =>
    queryOptions({ queryKey: ["watchlist"], queryFn: api.watchlist, refetchInterval: 15_000 }),
  accountCash: () => queryOptions({ queryKey: ["account-cash"], queryFn: api.accountCash }),
};

/**
 * Every query a cash-moving action can change. Placing, cancelling or filling
 * an order, a deposit/withdrawal and account provisioning all invalidate this
 * set, so balances never disagree across screens.
 */
export const CASH_DERIVED_KEYS = [
  ["portfolio"],
  ["portfolio-history"],
  ["ledger"],
  ["orders"],
  ["account-cash"],
  ["me"],
] as const;
