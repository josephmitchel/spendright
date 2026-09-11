import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { CARD_TYPES } from '@/lib/card-types';
import type { ItemErrorBody } from '@/lib/plaid-errors';
import type { RawProviderPayload } from '@/lib/provider-types';

// Namespaced like the advisory-lock class id in sync-lock.ts: generic table
// names must not collide with another app's on a shared database.
export const spendrightSchema = pgSchema('spendright');

export const cards = spendrightSchema.table('cards', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  type: text('type', { enum: CARD_TYPES }).notNull(),
  plaidAccountNames: jsonb('plaid_account_names').$type<string[]>().notNull().default([]),
  // When and against what source the seed's rates were last checked; the UI
  // warns once this goes stale.
  ratesVerifiedOn: date('rates_verified_on'),
  ratesVerifiedSource: text('rates_verified_source'),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cardCategories = spendrightSchema.table(
  'card_categories',
  {
    id: serial('id').primaryKey(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rate: numeric('rate').notNull(),
    // Real card terms cap elevated categories: past annualCapAmount of
    // calendar-year spend in this category, postCapRate applies. Both set or
    // both null.
    annualCapAmount: numeric('annual_cap_amount'),
    postCapRate: numeric('post_cap_rate'),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('card_categories_card_id_name_uq').on(table.cardId, table.name),
    check(
      'card_categories_cap_pair_ck',
      sql`(${table.annualCapAmount} is null) = (${table.postCapRate} is null)`,
    ),
  ],
);

export const creditCategories = spendrightSchema.table('credit_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const items = spendrightSchema.table('items', {
  id: serial('id').primaryKey(),
  itemId: text('item_id').notNull().unique(),
  // Encrypted.
  accessToken: text('access_token').notNull(),
  institutionId: text('institution_id'),
  institutionName: text('institution_name'),
  institutionLogo: text('institution_logo'),
  institutionPrimaryColor: text('institution_primary_color'),
  cursor: text('cursor'),
  error: jsonb('error').$type<ItemErrorBody>(),
  skippedSyncs: integer('skipped_syncs').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = spendrightSchema.table(
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
    unofficialCurrencyCode: text('unofficial_currency_code'),
    cardId: integer('card_id').references(() => cards.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('accounts_item_id_idx').on(table.itemId)],
);

export const transactions = spendrightSchema.table(
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
    unofficialCurrencyCode: text('unofficial_currency_code'),
    category: text('category'),
    pending: boolean('pending'),
    cardCategoryId: integer('card_category_id').references(() => cardCategories.id, {
      onDelete: 'set null',
    }),
    rewardRate: numeric('reward_rate'),
    creditCategoryId: integer('credit_category_id').references(() => creditCategories.id, {
      onDelete: 'set null',
    }),
    plaidTransaction: jsonb('plaid_transaction').$type<RawProviderPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_account_date_idx').on(table.accountId, table.date.desc()),
    index('transactions_item_id_idx').on(table.itemId),
    index('transactions_card_category_id_idx').on(table.cardCategoryId),
    index('transactions_credit_category_id_idx').on(table.creditCategoryId),
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
