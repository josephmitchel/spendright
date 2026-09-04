ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_one_category_kind_ck";--> statement-breakpoint
-- Hand-written data statements: apply with `npm run db:migrate`, never
-- `drizzle-kit push` (push emits only the schema diff, so the constraint
-- below would fail to apply on any database holding legacy rows).
-- Backfill: clear wrong-kind category state left by the pre-sign-rule era,
-- when card categories were assignable to negative-amount rows. The category
-- ids have to go for the constraint below to apply; reward_rate goes with
-- them because a rate on an inflow row never described real earnings — it
-- came from a categorization that should not have been possible. That is why
-- this is not the "rates are history, keep them" case that every runtime path
-- honours.
UPDATE "transactions" SET "card_category_id" = null, "reward_rate" = null WHERE "amount" < 0 AND ("card_category_id" IS NOT NULL OR "reward_rate" IS NOT NULL);--> statement-breakpoint
UPDATE "transactions" SET "credit_category_id" = null WHERE "amount" >= 0 AND "credit_category_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_kind_sign_ck" CHECK (("transactions"."card_category_id" is null or "transactions"."amount" >= 0) and ("transactions"."credit_category_id" is null or "transactions"."amount" < 0));