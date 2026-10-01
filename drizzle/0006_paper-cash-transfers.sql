CREATE TYPE "public"."cash_transfer_direction" AS ENUM('DEPOSIT', 'WITHDRAWAL');--> statement-breakpoint
CREATE TYPE "public"."cash_transfer_state" AS ENUM('PENDING', 'SETTLED', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "cash_transfers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"direction" "cash_transfer_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"state" "cash_transfer_state" DEFAULT 'PENDING' NOT NULL,
	"venue_transfer_id" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_transfers_venue_transfer_unique" UNIQUE("venue_transfer_id"),
	CONSTRAINT "cash_transfers_amount_positive" CHECK ("cash_transfers"."amount" > 0),
	CONSTRAINT "cash_transfers_settled_at_iff_settled" CHECK (("cash_transfers"."state" = 'SETTLED') = ("cash_transfers"."settled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_transfers_idempotency_unique" ON "cash_transfers" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cash_transfers_account_created_idx" ON "cash_transfers" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cash_transfers_pending_idx" ON "cash_transfers" USING btree ("account_id") WHERE "cash_transfers"."state" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_cash_transfer_once" ON "ledger_entries" USING btree ("ref_id") WHERE "ledger_entries"."ref_type" = 'CASH_TRANSFER';