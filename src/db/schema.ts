import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

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
    // Full raw Plaid transaction payload
    plaidTransaction: jsonb('plaid_transaction').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_account_date_idx').on(table.accountId, table.date.desc()),
    index('transactions_item_id_idx').on(table.itemId),
  ],
);

export type ItemRow = typeof items.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
