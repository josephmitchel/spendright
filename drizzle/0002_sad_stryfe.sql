CREATE TABLE "credit_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_category_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_category_id_credit_categories_id_fk" FOREIGN KEY ("credit_category_id") REFERENCES "public"."credit_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_one_category_kind_ck" CHECK ("transactions"."card_category_id" is null or "transactions"."credit_category_id" is null);