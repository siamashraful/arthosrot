CREATE TABLE "company_fundamentals" (
	"symbol" text PRIMARY KEY NOT NULL,
	"cik" text NOT NULL,
	"name" text NOT NULL,
	"shares" bigint NOT NULL,
	"shares_as_of" text NOT NULL,
	"shares_basis" text NOT NULL,
	"eps_ttm" numeric(18, 4),
	"eps_basis" text,
	"eps_period_end" text,
	"eps_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "company_fundamentals_cik" ON "company_fundamentals" USING btree ("cik");