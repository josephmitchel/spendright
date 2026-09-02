CREATE TABLE "card_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"name" text NOT NULL,
	"rate" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_categories_card_id_name_uq" UNIQUE("card_id","name")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"type" text NOT NULL,
	"plaid_account_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "card_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "card_category_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reward_rate" numeric;--> statement-breakpoint
ALTER TABLE "card_categories" ADD CONSTRAINT "card_categories_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_category_id_card_categories_id_fk" FOREIGN KEY ("card_category_id") REFERENCES "public"."card_categories"("id") ON DELETE set null ON UPDATE no action;