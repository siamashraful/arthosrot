import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Database schema — the single source; docs/architecture/DATA_MODEL.md mirrors it.
 * Conventions: money NUMERIC(18,2), prices NUMERIC(18,4), quantities BIGINT,
 * cost basis NUMERIC(20,4). NUMERIC maps to string, never JS number.
 * Append-only tables (ledger_entries, fills, order_events) are protected by
 * triggers (see the append-only migration) — corrections are new rows.
 */

// ---------------------------------------------------------------------------
// Better Auth identity tables (managed by better-auth's drizzle adapter)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Trading foundation
// ---------------------------------------------------------------------------

export const accountStatus = pgEnum("account_status", [
  "PROVISIONING",
  "ACTIVE",
  "ARCHIVED",
  "PROVISIONING_FAILED",
]);

export const brokerKind = pgEnum("broker_kind", ["DETERMINISTIC", "ALPACA_PAPER"]);

export const reconciliationStatus = pgEnum("reconciliation_status", [
  "HEALTHY",
  "STALE",
  "RECONCILING",
  "DRIFT_DETECTED",
  "ERROR",
]);

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "DEPOSIT",
  "TRADE",
  "FEE",
  "ADJUSTMENT",
  // reserved for the future; do not use at MVP:
  "WITHDRAWAL",
  "DIVIDEND",
  "CORPORATE_ACTION",
  "RECONCILIATION_ADJUSTMENT",
]);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: text("mode").notNull().default("PAPER"),
    status: accountStatus("status").notNull().default("PROVISIONING"),
    currency: text("currency").notNull().default("USD"),
    startingCash: numeric("starting_cash", { precision: 18, scale: 2 }).notNull(),
    // Cached projection of SUM(ledger_entries.amount). Deliberately NO >= 0
    // CHECK: a real fill must never be rejected by the projection (drift is a
    // reconciliation alarm, not a constraint violation).
    cashBalance: numeric("cash_balance", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("accounts_mode_paper_only", sql`${t.mode} = 'PAPER'`),
    uniqueIndex("accounts_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const brokerAccounts = pgTable(
  "broker_accounts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tradingAccountId: text("trading_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    broker: brokerKind("broker").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    status: accountStatus("status").notNull().default("PROVISIONING"),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    lastStreamEventAt: timestamp("last_stream_event_at", { withTimezone: true }),
    reconciliationStatus: reconciliationStatus("reconciliation_status")
      .notNull()
      .default("HEALTHY"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("broker_accounts_external_unique").on(t.broker, t.externalAccountId),
    uniqueIndex("broker_accounts_trading_account_unique").on(t.tradingAccountId),
  ],
);

export const streamCursors = pgTable(
  "stream_cursors",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    broker: brokerKind("broker").notNull(),
    stream: text("stream").notNull(),
    lastUlid: text("last_ulid"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stream_cursors_unique").on(t.broker, t.stream)],
);

export const instruments = pgTable(
  "instruments",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    symbol: text("symbol").notNull().unique(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("instruments_symbol_uppercase", sql`${t.symbol} = upper(${t.symbol})`)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    entryType: ledgerEntryType("entry_type").notNull(),
    // Signed. Positive = cash in, negative = cash out.
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ledger_entries_amount_nonzero", sql`${t.amount} <> 0`),
    index("ledger_entries_account_created_idx").on(t.accountId, t.createdAt.desc()),
  ],
);

export const marketDataCache = pgTable("market_data_cache", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cacheKey: text("cache_key").notNull().unique(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  staleAfter: timestamp("stale_after", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Orders & execution
// ---------------------------------------------------------------------------

export const orderSide = pgEnum("order_side", ["BUY", "SELL"]);
export const orderType = pgEnum("order_type", ["MARKET", "LIMIT"]);
export const timeInForce = pgEnum("time_in_force", ["DAY"]);

export const orderState = pgEnum("order_state", [
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_PENDING",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "SUBMIT_FAILED",
]);

export const orderEventSource = pgEnum("order_event_source", [
  "broker",
  "local",
  "inferred",
  "reconciliation",
]);

export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    symbol: text("symbol").notNull(),
    side: orderSide("side").notNull(),
    type: orderType("type").notNull(),
    tif: timeInForce("tif").notNull().default("DAY"),
    qty: bigint("qty", { mode: "bigint" }).notNull(),
    limitPrice: numeric("limit_price", { precision: 18, scale: 4 }),
    state: orderState("state").notNull().default("PENDING_SUBMISSION"),
    filledQty: bigint("filled_qty", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    rejectReason: text("reject_reason"),
    needsAttention: boolean("needs_attention").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    broker: brokerKind("broker"),
    brokerOrderId: text("broker_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("orders_qty_positive", sql`${t.qty} > 0`),
    check("orders_filled_qty_bounds", sql`${t.filledQty} >= 0 AND ${t.filledQty} <= ${t.qty}`),
    check("orders_limit_price_presence", sql`(${t.limitPrice} IS NULL) = (${t.type} = 'MARKET')`),
    uniqueIndex("orders_idempotency_unique").on(t.accountId, t.idempotencyKey),
    uniqueIndex("orders_broker_order_unique").on(t.broker, t.brokerOrderId),
    index("orders_account_state_idx").on(t.accountId, t.state),
    index("orders_open_states_idx")
      .on(t.state)
      .where(
        sql`${t.state} IN ('PENDING_SUBMISSION','ACKNOWLEDGED','ACCEPTED','PARTIALLY_FILLED','CANCEL_PENDING')`,
      ),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    canonicalEventType: text("canonical_event_type").notNull(),
    fromState: orderState("from_state"),
    toState: orderState("to_state"),
    source: orderEventSource("source").notNull(),
    broker: brokerKind("broker"),
    externalEventId: text("external_event_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_events_external_unique").on(t.broker, t.externalEventId),
    index("order_events_order_idx").on(t.orderId),
  ],
);

export const fills = pgTable(
  "fills",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    qty: bigint("qty", { mode: "bigint" }).notNull(),
    price: numeric("price", { precision: 18, scale: 4 }).notNull(),
    fee: numeric("fee", { precision: 18, scale: 2 }).notNull().default("0"),
    notional: numeric("notional", { precision: 18, scale: 2 }).notNull(),
    broker: brokerKind("broker").notNull(),
    executionId: text("execution_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("fills_qty_positive", sql`${t.qty} > 0`),
    uniqueIndex("fills_execution_unique").on(t.broker, t.executionId),
    index("fills_order_idx").on(t.orderId),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    symbol: text("symbol").notNull(),
    qty: bigint("qty", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    costBasisTotal: numeric("cost_basis_total", { precision: 20, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("positions_qty_nonnegative", sql`${t.qty} >= 0`),
    check("positions_basis_nonnegative", sql`${t.costBasisTotal} >= 0`),
    uniqueIndex("positions_account_instrument_unique").on(t.accountId, t.instrumentId),
  ],
);

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export const watchlists = pgTable(
  "watchlists",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Watchlist"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlists_user_unique").on(t.userId)],
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    watchlistId: text("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_items_unique").on(t.watchlistId, t.instrumentId)],
);
