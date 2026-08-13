"use client";

/** Typed client for /api/v1 — money/prices stay strings end to end. */

export interface ApiErrorBody {
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
}

export interface OrderDto {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: string;
  limitPrice: string | null;
  state: string;
  stateDisplay: string;
  filledQty: string;
  reservedCash: string;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstrumentDetailDto {
  instrument: { symbol: string; name: string; exchange: string };
  quote: QuoteDto;
  market: { status: string; asOf: string };
  freshness: "live" | "aging" | "stale" | "at-close";
}

export interface PortfolioDto {
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

export interface LedgerEntryDto {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

export interface WatchlistItemDto {
  id: string;
  symbol: string;
  name: string;
  quote: QuoteDto | null;
}

export interface CandleDto {
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
      account: { cash: string; status: string } | null;
    }>("/api/v1/me"),
  searchInstruments: (query: string) =>
    request<{ instruments: Array<{ symbol: string; name: string; exchange: string }> }>(
      `/api/v1/instruments?query=${encodeURIComponent(query)}`,
    ),
  instrument: (symbol: string) =>
    request<InstrumentDetailDto>(`/api/v1/instruments/${encodeURIComponent(symbol)}`),
  candles: (symbol: string, range: string) =>
    request<{ candles: CandleDto[] }>(
      `/api/v1/instruments/${encodeURIComponent(symbol)}/candles?range=${range}`,
    ),
  portfolio: () => request<PortfolioDto>("/api/v1/portfolio"),
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
  ledger: () => request<{ entries: LedgerEntryDto[] }>("/api/v1/ledger"),
  watchlist: () => request<{ items: WatchlistItemDto[] }>("/api/v1/watchlist"),
  addToWatchlist: (symbol: string) =>
    request<{ items: WatchlistItemDto[] }>("/api/v1/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol }),
    }),
  removeFromWatchlist: (id: string) =>
    request<{ items: WatchlistItemDto[] }>(`/api/v1/watchlist/items/${id}`, { method: "DELETE" }),
  resetAccount: () =>
    request<{ account: { id: string; cash: string } }>("/api/v1/account/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET" }),
    }),
  systemStatus: () =>
    request<{ market: { status: string; asOf: string }; broker: { pipeline: string } }>(
      "/api/v1/system/status",
    ),
};
