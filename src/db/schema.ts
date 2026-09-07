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
import type { Transaction as PlaidTransactionPayload } from 'plaid';
import type { ItemErrorBody } from '@/lib/plaid-errors';

// Credit card definitions (seeded from src/db/cards.seed.ts). `type` decides
// how `card_categories.rate` reads: cashback → percentage, points →
// multiplier. Rows are retired via `retired_at`, never deleted.
// Design: categories-retired-not-deleted.
export const cards = pgTable('cards', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  type: text('type', { enum: ['cashback', 'points'] }).notNull(),
  // Plaid account names that resolve to this card (case-insensitive exact match)
  plaidAccountNames: jsonb('plaid_account_names').$type<string[]>().notNull().default([]),
  // Set by the seed when the slug leaves the seed file; null while offered.
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
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('card_categories_card_id_name_uq').on(table.cardId, table.name)],
);

// Categories for inflow transactions (negative Plaid amounts: payments,
// refunds, rewards). Global — shared by every card — and rate-less.
export const creditCategories = pgTable('credit_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
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
  // A picked Plaid error body or { message }. Design: error-message-allow-list.
  error: jsonb('error').$type<ItemErrorBody>(),
  // Consecutive syncs that held the cursor back over an unknown account.
  // Design: bounded-cursor-hold.
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
    // and the rate at selection time. Sync never overwrites a pick, but
    // carries these across a pending-to-posted repost and clears them on a
    // sign flip. Design: categorization-is-a-historical-snapshot.
    cardCategoryId: integer('card_category_id').references(() => cardCategories.id, {
      onDelete: 'set null',
    }),
    rewardRate: numeric('reward_rate'),
    // User-selected inflow category (inflow rows only, amount < 0).
    // Never carries a rate.
    creditCategoryId: integer('credit_category_id').references(() => creditCategories.id, {
      onDelete: 'set null',
    }),
    // Full raw Plaid transaction payload
    plaidTransaction: jsonb('plaid_transaction').$type<PlaidTransactionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_account_date_idx').on(table.accountId, table.date.desc()),
    index('transactions_item_id_idx').on(table.itemId),
    index('transactions_card_category_id_idx').on(table.cardCategoryId),
    index('transactions_credit_category_id_idx').on(table.creditCategoryId),
    // Card categories only on spend rows, credit categories only on inflow rows.
    // Design: category-kind-sign-rule.
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
