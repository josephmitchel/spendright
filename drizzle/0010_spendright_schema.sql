CREATE SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "cards" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "card_categories" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "credit_categories" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "items" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "accounts" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "transactions" SET SCHEMA "spendright";--> statement-breakpoint
ALTER TABLE "spendright"."cards" ADD COLUMN "rates_verified_on" date;--> statement-breakpoint
ALTER TABLE "spendright"."cards" ADD COLUMN "rates_verified_source" text;--> statement-breakpoint
ALTER TABLE "spendright"."card_categories" ADD COLUMN "annual_cap_amount" numeric;--> statement-breakpoint
ALTER TABLE "spendright"."card_categories" ADD COLUMN "post_cap_rate" numeric;--> statement-breakpoint
ALTER TABLE "spendright"."card_categories" ADD CONSTRAINT "card_categories_cap_pair_ck" CHECK (("spendright"."card_categories"."annual_cap_amount" is null) = ("spendright"."card_categories"."post_cap_rate" is null));