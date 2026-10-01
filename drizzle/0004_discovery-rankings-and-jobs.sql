CREATE TABLE "job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_error" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_cap_entries" (
	"snapshot_id" text NOT NULL,
	"rank" bigint NOT NULL,
	"cik" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"shares" bigint NOT NULL,
	"price" numeric(18, 4) NOT NULL,
	"market_cap" numeric(24, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_cap_snapshots" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_cap_entries" ADD CONSTRAINT "market_cap_entries_snapshot_id_market_cap_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_cap_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_cap_entries_rank" ON "market_cap_entries" USING btree ("snapshot_id","rank");--> statement-breakpoint
CREATE INDEX "market_cap_snapshots_latest" ON "market_cap_snapshots" USING btree ("list","created_at");