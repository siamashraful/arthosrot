CREATE TABLE "price_alerts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"threshold" numeric(18, 4) NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone,
	"trigger_price" numeric(18, 4),
	"trigger_quote_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "price_alerts_direction" CHECK ("price_alerts"."direction" IN ('ABOVE', 'BELOW')),
	CONSTRAINT "price_alerts_state" CHECK ("price_alerts"."state" IN ('ACTIVE', 'TRIGGERED', 'CANCELED')),
	CONSTRAINT "price_alerts_threshold_positive" CHECK ("price_alerts"."threshold" > 0),
	CONSTRAINT "price_alerts_symbol_uppercase" CHECK ("price_alerts"."symbol" = upper("price_alerts"."symbol")),
	CONSTRAINT "price_alerts_trigger_facts" CHECK (("price_alerts"."triggered_at" IS NULL) = ("price_alerts"."trigger_price" IS NULL) AND ("price_alerts"."triggered_at" IS NULL) = ("price_alerts"."trigger_quote_at" IS NULL)),
	CONSTRAINT "price_alerts_triggered_has_facts" CHECK ("price_alerts"."state" <> 'TRIGGERED' OR "price_alerts"."triggered_at" IS NOT NULL),
	CONSTRAINT "price_alerts_active_untriggered" CHECK ("price_alerts"."state" <> 'ACTIVE' OR "price_alerts"."triggered_at" IS NULL),
	CONSTRAINT "price_alerts_trigger_price_positive" CHECK ("price_alerts"."trigger_price" IS NULL OR "price_alerts"."trigger_price" > 0),
	CONSTRAINT "price_alerts_read_after_trigger" CHECK ("price_alerts"."read_at" IS NULL OR "price_alerts"."triggered_at" IS NOT NULL),
	CONSTRAINT "price_alerts_canceled_at_iff_canceled" CHECK (("price_alerts"."state" = 'CANCELED') = ("price_alerts"."canceled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_alerts_state_symbol_idx" ON "price_alerts" USING btree ("state","symbol");--> statement-breakpoint
CREATE INDEX "price_alerts_user_created_idx" ON "price_alerts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "price_alerts_active_unique" ON "price_alerts" USING btree ("user_id","symbol","direction","threshold") WHERE "price_alerts"."state" = 'ACTIVE';