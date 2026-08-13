CREATE TYPE "public"."account_status" AS ENUM('PROVISIONING', 'ACTIVE', 'ARCHIVED', 'PROVISIONING_FAILED');--> statement-breakpoint
CREATE TYPE "public"."broker_kind" AS ENUM('DETERMINISTIC', 'ALPACA_PAPER');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('DEPOSIT', 'TRADE', 'FEE', 'ADJUSTMENT', 'WITHDRAWAL', 'DIVIDEND', 'CORPORATE_ACTION', 'RECONCILIATION_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."order_event_source" AS ENUM('broker', 'local', 'inferred', 'reconciliation');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('PENDING_SUBMISSION', 'ACKNOWLEDGED', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCEL_PENDING', 'CANCELLED', 'REJECTED', 'EXPIRED', 'SUBMIT_FAILED');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('MARKET', 'LIMIT');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('HEALTHY', 'STALE', 'RECONCILING', 'DRIFT_DETECTED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."time_in_force" AS ENUM('DAY');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mode" text DEFAULT 'PAPER' NOT NULL,
	"status" "account_status" DEFAULT 'PROVISIONING' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"starting_cash" numeric(18, 2) NOT NULL,
	"cash_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_mode_paper_only" CHECK ("accounts"."mode" = 'PAPER')
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trading_account_id" text NOT NULL,
	"broker" "broker_kind" NOT NULL,
	"external_account_id" text NOT NULL,
	"status" "account_status" DEFAULT 'PROVISIONING' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"last_stream_event_at" timestamp with time zone,
	"reconciliation_status" "reconciliation_status" DEFAULT 'HEALTHY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fills" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"qty" bigint NOT NULL,
	"price" numeric(18, 4) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"notional" numeric(18, 2) NOT NULL,
	"broker" "broker_kind" NOT NULL,
	"execution_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fills_qty_positive" CHECK ("fills"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"exchange" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_symbol_unique" UNIQUE("symbol"),
	CONSTRAINT "instruments_symbol_uppercase" CHECK ("instruments"."symbol" = upper("instruments"."symbol"))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_nonzero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "market_data_cache" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	CONSTRAINT "market_data_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"canonical_event_type" text NOT NULL,
	"from_state" "order_state",
	"to_state" "order_state",
	"source" "order_event_source" NOT NULL,
	"broker" "broker_kind",
	"external_event_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"type" "order_type" NOT NULL,
	"tif" time_in_force DEFAULT 'DAY' NOT NULL,
	"qty" bigint NOT NULL,
	"limit_price" numeric(18, 4),
	"state" "order_state" DEFAULT 'PENDING_SUBMISSION' NOT NULL,
	"filled_qty" bigint DEFAULT 0 NOT NULL,
	"reject_reason" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"idempotency_key" text NOT NULL,
	"broker" "broker_kind",
	"broker_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_qty_positive" CHECK ("orders"."qty" > 0),
	CONSTRAINT "orders_filled_qty_bounds" CHECK ("orders"."filled_qty" >= 0 AND "orders"."filled_qty" <= "orders"."qty"),
	CONSTRAINT "orders_limit_price_presence" CHECK (("orders"."limit_price" IS NULL) = ("orders"."type" = 'MARKET'))
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"symbol" text NOT NULL,
	"qty" bigint DEFAULT 0 NOT NULL,
	"cost_basis_total" numeric(20, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_qty_nonnegative" CHECK ("positions"."qty" >= 0),
	CONSTRAINT "positions_basis_nonnegative" CHECK ("positions"."cost_basis_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stream_cursors" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker" "broker_kind" NOT NULL,
	"stream" text NOT NULL,
	"last_ulid" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Watchlist' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_trading_account_id_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_one_active_per_user" ON "accounts" USING btree ("user_id") WHERE "accounts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_accounts_external_unique" ON "broker_accounts" USING btree ("broker","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_accounts_trading_account_unique" ON "broker_accounts" USING btree ("trading_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fills_execution_unique" ON "fills" USING btree ("broker","execution_id");--> statement-breakpoint
CREATE INDEX "fills_order_idx" ON "fills" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_idx" ON "ledger_entries" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_external_unique" ON "order_events" USING btree ("broker","external_event_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_unique" ON "orders" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_broker_order_unique" ON "orders" USING btree ("broker","broker_order_id");--> statement-breakpoint
CREATE INDEX "orders_account_state_idx" ON "orders" USING btree ("account_id","state");--> statement-breakpoint
CREATE INDEX "orders_open_states_idx" ON "orders" USING btree ("state") WHERE "orders"."state" IN ('PENDING_SUBMISSION','ACKNOWLEDGED','ACCEPTED','PARTIALLY_FILLED','CANCEL_PENDING');--> statement-breakpoint
CREATE UNIQUE INDEX "positions_account_instrument_unique" ON "positions" USING btree ("account_id","instrument_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_cursors_unique" ON "stream_cursors" USING btree ("broker","stream");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_unique" ON "watchlist_items" USING btree ("watchlist_id","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_unique" ON "watchlists" USING btree ("user_id");