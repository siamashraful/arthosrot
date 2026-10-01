"use client";

/** Typed client for /api/v1 — money/prices stay strings end to end. */

interface ApiErrorBody {
  error: { code: string; subcode?: string; message: string; requestId: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody["error"],
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error ?? { code: "INTERNAL", message: "Request failed", requestId: "" },
    );
  }
  return (await res.json()) as T;
}

export interface QuoteDto {
  symbol: string;
  bid: string | null;
  bidSize: number | null;
  ask: string | null;
  askSize: number | null;
  last: string;
  ts: string;
  source: string;
  /** Prior session close; null when the feed has none. */
  previousClose: string | null;
  /** Server-computed (exact decimal) move vs previousClose. */
  dayChange: { absolute: string; percent: string } | null;
}

export interface InstrumentStatsDto {
  symbol: string;
  marketCap: string | null;
  sharesAsOf: string | null;
  pe: string | null;
  peBasis: "ttm" | "fy" | null;
  epsPeriodEnd: string | null;
  peNotMeaningful: boolean;
  week52: { high: string; low: string } | null;
}

export type BrowseIcon =
  | "trophy"
  | "cpu"
  | "radio-tower"
  | "shopping-bag"
  | "shopping-cart"
  | "heart-pulse"
  | "landmark"
  | "factory"
  | "fuel"
  | "pickaxe"
  | "building"
  | "zap";

export interface BrowseDto {
  top100: { slug: string; name: string; count: number; asOf: string; preview: string[] };
  sectors: Array<{
    slug: string;
    name: string;
    icon: BrowseIcon;
    count: number;
    preview: string[];
  }>;
}

export interface BrowseListDto {
  list: { slug: string; name: string; blurb: string; icon: BrowseIcon; count: number };
  /** Top 100 only: when the ranking was computed. */
  rankingAsOf: string | null;
  page: number;
  nextPage: number | null;
  instruments: Array<{
    rank?: number;
    symbol: string;
    name: string;
    marketCap?: string | null;
    quote: QuoteDto | null;
  }>;
  market: { status: string; asOf: string };
  /** Display freshness of the stalest quote on the page (one chip per list). */
  freshness: "live" | "aging" | "stale" | "at-close" | null;
  freshnessTs: string | null;
  source: string | null;
}

/** What a day change covers: the current trading day, or the last session once CLOSED. */
export type DayChangePeriodDto = "today" | "last-session";

/** GET /api/v1/browse/movers — top gainers/losers across Top 100 ∪ sectors. */
export interface MoversDto {
  /** At most 5 each, biggest move first; empty when nothing qualifies. */
  gainers: MoverRowDto[];
  losers: MoverRowDto[];
  period: DayChangePeriodDto;
  asOf: string;
  market: { status: string; asOf: string };
  /** Display freshness of the stalest quote shown (one chip per section). */
  freshness: "live" | "aging" | "stale" | "at-close" | null;
  freshnessTs: string | null;
  source: string | null;
}

export interface MoverRowDto {
  symbol: string;
  name: string;
  quote: QuoteDto;
  dayChange: { absolute: string; percent: string } | null;
}

/** GET /api/v1/watchlist/quotes — the caller's watchlist quotes + sparklines. */
export interface WatchlistQuotesDto {
  items: Array<{
    symbol: string;
    /** null when the feed can't quote the symbol (e.g. delisted). */
    quote: QuoteDto | null;
    /** Latest session's closes (≤ 40, decimal strings); null when unavailable. */
    sparkline: string[] | null;
  }>;
  period: DayChangePeriodDto;
  market: { status: string; asOf: string };
  freshness: "live" | "aging" | "stale" | "at-close" | null;
  freshnessTs: string | null;
  source: string | null;
}

/** Canonical order lifecycle states (docs/architecture/EXECUTION.md). */
export type OrderState =
  | "PENDING_SUBMISSION"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "SUBMIT_FAILED";

export interface OrderDto {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: string;
  limitPrice: string | null;
  state: OrderState;
  stateDisplay: string;
  filledQty: string;
  reservedCash: string;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InstrumentDetailDto {
  /** status "ACTIVE" is buyable; any other status (delisted) accepts sells only. */
  instrument: { symbol: string; name: string; exchange: string; status: string };
  /** null when the feed no longer quotes a known instrument (delisting). */
  quote: QuoteDto | null;
  market: { status: string; asOf: string };
  freshness: "live" | "aging" | "stale" | "at-close" | null;
  /** Placement rules the ticket mirrors: market buys reserve price × qty × (1 + buffer). */
  trading: { marketBuyBuffer: string };
}

interface PortfolioDto {
  positions: Array<{
    symbol: string;
    qty: string;
    sellableQty: string;
    avgCost: string;
    lastPrice: string;
    marketValue: string;
    unrealizedPnl: string;
    quoteTs: string;
  }>;
  summary: {
    equity: string;
    cash: string;
    buyingPower: string;
    positionsValue: string;
    realizedPnl: string;
    asOf: string;
  };
  market: { status: string; asOf: string };
}

interface LedgerEntryDto {
  id: string;
  type: string;
  amount: string;
  description: string;
  archived: boolean;
  createdAt: string;
}

interface WatchlistItemDto {
  id: string;
  symbol: string;
  name: string;
  quote: QuoteDto | null;
}

/** One row of GET /api/v1/watchlist (the ["watchlist"] query). */
export type WatchlistItem = WatchlistItemDto;

export type TransferDirectionDto = "DEPOSIT" | "WITHDRAWAL";

export interface CashTransferDto {
  id: string;
  direction: TransferDirectionDto;
  amount: string;
  state: "PENDING" | "SETTLED" | "FAILED" | "CANCELED";
  createdAt: string;
  settledAt: string | null;
  failureReason: string | null;
}

/** GET /api/v1/account/cash — the read also settles due pending transfers. */
export interface AccountCashDto {
  status: string;
  cash: string;
  reservedForOrders: string;
  pendingDeposits: string;
  pendingWithdrawals: string;
  /** cash − cash reserved for open buy orders − pending withdrawals. */
  withdrawable: string;
  limits: { minAmount: string; maxPerTransfer: string; depositRemainingToday: string };
  transfers: CashTransferDto[];
}

interface CandleDto {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
}

export const api = {
  me: () =>
    request<{
      user: { name: string; email: string };
      account: { cash: string; status: string; startingCash: string } | null;
      onboarding: {
        minStartingCash: number;
        maxStartingCash: number;
        defaultStartingCash: number;
      };
    }>("/api/v1/me"),
  provisionAccount: (startingCash: number) =>
    request<{ account: { id: string; status: string; cash: string } }>(
      "/api/v1/account/provision",
      { method: "POST", body: JSON.stringify({ startingCash }) },
    ),
  instrumentStats: (symbol: string) =>
    request<InstrumentStatsDto>(`/api/v1/instruments/${encodeURIComponent(symbol)}/stats`),
  browse: () => request<BrowseDto>("/api/v1/browse"),
  browseList: (slug: string, page: number) =>
    request<BrowseListDto>(`/api/v1/browse/${encodeURIComponent(slug)}?page=${page}`),
  movers: () => request<MoversDto>("/api/v1/browse/movers"),
  watchlistQuotes: () => request<WatchlistQuotesDto>("/api/v1/watchlist/quotes"),
  searchInstruments: (query: string) =>
    request<{ instruments: Array<{ symbol: string; name: string; exchange: string }> }>(
      `/api/v1/instruments?query=${encodeURIComponent(query)}`,
    ),
  instrument: (symbol: string) =>
    request<InstrumentDetailDto>(`/api/v1/instruments/${encodeURIComponent(symbol)}`),
  candles: (symbol: string, range: string) =>
    request<{ range: string; candles: CandleDto[] }>(
      `/api/v1/instruments/${encodeURIComponent(symbol)}/candles?range=${range}`,
    ),
  portfolio: () => request<PortfolioDto>("/api/v1/portfolio"),
  portfolioHistory: (range: string) =>
    request<{
      range: string;
      resolvedRange: string;
      points: Array<{ t: string; value: string; netDeposits: string }>;
      change: { absolute: string; percent: string | null };
      asOf: string;
    }>(`/api/v1/portfolio/history?range=${range}`),
  orders: (status: "open" | "all") =>
    request<{ orders: OrderDto[] }>(`/api/v1/orders?status=${status}`),
  orderDetail: (id: string) =>
    request<{
      order: OrderDto;
      events: Array<{ type: string; toState: string | null; source: string; occurredAt: string }>;
      fills: Array<{ qty: string; price: string; notional: string; occurredAt: string }>;
    }>(`/api/v1/orders/${id}`),
  placeOrder: (input: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    qty: number;
    limitPrice?: string;
    idempotencyKey: string;
  }) =>
    request<{ order: OrderDto; replayed: boolean }>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelOrder: (id: string) =>
    request<{ order: OrderDto }>(`/api/v1/orders/${id}/cancel`, { method: "POST" }),
  ledger: (before?: string) =>
    request<{ entries: LedgerEntryDto[]; nextCursor: string | null }>(
      before ? `/api/v1/ledger?before=${encodeURIComponent(before)}` : "/api/v1/ledger",
    ),
  watchlist: () => request<{ items: WatchlistItemDto[] }>("/api/v1/watchlist"),
  addToWatchlist: (symbol: string) =>
    request<{ items: WatchlistItemDto[] }>("/api/v1/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol }),
    }),
  removeFromWatchlist: (id: string) =>
    request<{ items: WatchlistItemDto[] }>(`/api/v1/watchlist/items/${id}`, { method: "DELETE" }),
  resetAccount: () =>
    request<{ account: { id: string; status: string; cash: string } }>("/api/v1/account/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET" }),
    }),
  accountCash: () => request<AccountCashDto>("/api/v1/account/cash"),
  /** Paper deposit / withdrawal. Reuse `idempotencyKey` for retries of the same submission. */
  createTransfer: (direction: TransferDirectionDto, amount: string, idempotencyKey: string) =>
    request<{ transfer: CashTransferDto; cash: AccountCashDto }>("/api/v1/account/transfers", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ direction, amount }),
    }),
  systemStatus: () =>
    request<{
      market: { status: string; asOf: string };
      broker: { pipeline: string; lastSyncAt: string | null };
    }>("/api/v1/system/status"),
  // Price alerts (ADR-016)
  /** The user's alerts, newest first (also evaluates their active alerts). */
  alerts: () => request<{ alerts: PriceAlertDto[]; unreadCount: number }>("/api/v1/alerts"),
  /** 201 for a new alert; 200 (`created: false`) when an identical active alert exists. */
  createAlert: (input: { symbol: string; direction: AlertDirectionDto; price: string }) =>
    request<{ alert: PriceAlertDto; created: boolean }>("/api/v1/alerts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteAlert: (id: string) =>
    request<{ alert: PriceAlertDto }>(`/api/v1/alerts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  /** Mark triggered alerts read: all of them, or only `ids`. */
  markAlertsRead: (ids?: string[]) =>
    request<{ updated: number; unreadCount: number }>("/api/v1/alerts/read", {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    }),
  alertsUnreadCount: () => request<{ unreadCount: number }>("/api/v1/alerts/unread-count"),
};

// ---------------------------------------------------------------- price alerts

export type AlertDirectionDto = "ABOVE" | "BELOW";

/** A price alert (ADR-016). Prices are canonical 4dp strings. */
export interface PriceAlertDto {
  id: string;
  symbol: string;
  direction: AlertDirectionDto;
  threshold: string;
  state: "ACTIVE" | "TRIGGERED" | "CANCELED";
  createdAt: string;
  triggeredAt: string | null;
  /** The observed last price that triggered it (may be beyond the threshold on a gap). */
  triggerPrice: string | null;
  /** The triggering quote's own observation time. */
  triggerQuoteAt: string | null;
  readAt: string | null;
}
