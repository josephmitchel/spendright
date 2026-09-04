import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Credit card definitions (seeded from src/db/cards.seed.ts).
// `type` decides how `card_categories.rate` is interpreted:
// cashback → percentage, points → point multiplier.
//
// RETIRED, NEVER DELETED (decided 2026-09-04). Cards, card categories and credit
// categories carry a `retired_at` instead of being removed when they leave the
// seed file. A categorized transaction is a historical record of the category
// and rate that existed when it was picked, and a delete here would set-null
// that link on every old row. Retired rows are simply not offered: matchCard
// skips retired cards, GET /api/cards omits retired rows, and PATCH refuses a
// retired category. Re-adding a slug or name to the seed clears `retired_at`
// on the same row, so old links point at the revived row without a rewrite.
export const cards = pgTable('cards', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  type: text('type', { enum: ['cashback', 'points'] }).notNull(),
  // Plaid account names that resolve to this card (case-insensitive exact match)
  plaidAccountNames: jsonb('plaid_account_names').$type<string[]>().notNull().default([]),
  // Set by the seed when the slug leaves cards.seed.ts; null while offered.
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cardCategories = pgTable(
  'card_categories',
  {
    id: serial('id').primaryKey(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Cashback % for cashback cards, point multiplier for points cards
    rate: numeric('rate').notNull(),
    // Set by the seed when the name leaves the card's seed list; null while
    // offered. See the retirement note on `cards`.
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('card_categories_card_id_name_uq').on(table.cardId, table.name)],
);

// Categories for inflow transactions (negative Plaid amounts: payments,
// refunds, rewards). Global — shared by every card — and rate-less.
// Seeded from creditCategorySeeds in src/db/cards.seed.ts.
export const creditCategories = pgTable('credit_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  // Set by the seed when the name leaves creditCategorySeeds; null while
  // offered. See the retirement note on `cards`.
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  itemId: text('item_id').notNull().unique(),
  // AES-256-GCM encrypted, stored as iv:authTag:ciphertext hex
  accessToken: text('access_token').notNull(),
  institutionId: text('institution_id'),
  institutionName: text('institution_name'),
  institutionLogo: text('institution_logo'),
  institutionPrimaryColor: text('institution_primary_color'),
  cursor: text('cursor'),
  availableProducts: jsonb('available_products'),
  billedProducts: jsonb('billed_products'),
  error: jsonb('error'),
  // How many CONSECUTIVE syncs have held this item's cursor back because Plaid
  // sent transactions for an account that is not stored. Reset to 0 by a clean
  // sync, and also by the sync that gives up and drops the batch — see the
  // cursor note in src/lib/sync.ts for why the hold is bounded. It exists only
  // because that bound needs a counter to run off: the cursor being held is
  // otherwise the only state, and it cannot say how long it has been held.
  skippedSyncs: integer('skipped_syncs').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    accountId: text('account_id').notNull().unique(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.itemId, { onDelete: 'cascade' }),
    name: text('name'),
    officialName: text('official_name'),
    mask: text('mask'),
    type: text('type'),
    subtype: text('subtype'),
    balanceAvailable: numeric('balance_available'),
    balanceCurrent: numeric('balance_current'),
    balanceLimit: numeric('balance_limit'),
    isoCurrencyCode: text('iso_currency_code'),
    // Auto-matched card definition (by Plaid account name)
    cardId: integer('card_id').references(() => cards.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('accounts_item_id_idx').on(table.itemId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    transactionId: text('transaction_id').notNull().unique(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.accountId, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.itemId, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    name: text('name'),
    merchantName: text('merchant_name'),
    amount: numeric('amount').notNull(),
    isoCurrencyCode: text('iso_currency_code'),
    category: text('category'),
    pending: boolean('pending'),
    // User-selected card spending category (spend rows only, amount >= 0)
    // and its rate at selection time. Not written by sync, so re-syncs
    // preserve user choices. The link is never cleared by a card-side change:
    // categories are retired rather than deleted (see `cards`), so the
    // set-null below only ever fires on a delete made by hand.
    cardCategoryId: integer('card_category_id').references(() => cardCategories.id, {
      onDelete: 'set null',
    }),
    // A historical snapshot, never restated: seeding a new rate leaves it
    // alone, so past earnings stay accurate whatever the card's current terms.
    rewardRate: numeric('reward_rate'),
    // User-selected inflow category (inflow rows only, amount < 0).
    // Never carries a rate.
    creditCategoryId: integer('credit_category_id').references(() => creditCategories.id, {
      onDelete: 'set null',
    }),
    // Full raw Plaid transaction payload
    plaidTransaction: jsonb('plaid_transaction').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_account_date_idx').on(table.accountId, table.date.desc()),
    index('transactions_item_id_idx').on(table.itemId),
    // GET /api/transactions joins on both category columns to resolve names,
    // and both FKs are ON DELETE SET NULL — a hand delete of a category row
    // would otherwise scan this table to apply the set-null.
    index('transactions_card_category_id_idx').on(table.cardCategoryId),
    index('transactions_credit_category_id_idx').on(table.creditCategoryId),
    // Ties each category kind to the amount's sign (which also makes the two
    // kinds mutually exclusive): any writer that drifts from the sign rule
    // fails loudly instead of leaving invisible wrong-kind state.
    check(
      'transactions_category_kind_sign_ck',
      sql`(${table.cardCategoryId} is null or ${table.amount} >= 0) and (${table.creditCategoryId} is null or ${table.amount} < 0)`,
    ),
  ],
);

export type ItemRow = typeof items.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type CardCategoryRow = typeof cardCategories.$inferSelect;
export type CreditCategoryRow = typeof creditCategories.$inferSelect;
