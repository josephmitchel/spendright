ALTER TABLE "card_categories" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_categories" ADD COLUMN "retired_at" timestamp with time zone;