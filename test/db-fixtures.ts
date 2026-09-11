import { eq } from 'drizzle-orm';
import {
  accounts,
  cardCategories,
  cards,
  creditCategories,
  items,
  transactions,
} from '@/db/schema';
import { encrypt } from '@/lib/crypto';
import { db, lockPool, pool } from '@/lib/db';
import type { ProviderAccount, ProviderTransaction } from '@/lib/provider-types';

export async function endPools(): Promise<void> {
  await Promise.all([pool.end(), lockPool.end()]);
}

export function providerAccount(
  accountId: string,
  over: Partial<ProviderAccount> = {},
): ProviderAccount {
  return {
    accountId,
    name: 'Blue Cash Preferred®',
    officialName: 'Blue Cash Preferred Card',
    mask: '1234',
    type: 'credit',
    subtype: 'credit card',
    balanceAvailable: 1000,
    balanceCurrent: 250.5,
    balanceLimit: 5000,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    ...over,
  };
}

export async function truncateAll(): Promise<void> {
  await pool.query(
    'TRUNCATE spendright.transactions, spendright.accounts, spendright.items, ' +
      'spendright.card_categories, spendright.credit_categories, spendright.cards ' +
      'RESTART IDENTITY CASCADE',
  );
}

export async function seedItem(
  itemId: string,
  over: Partial<typeof items.$inferInsert> = {},
): Promise<void> {
  await db.insert(items).values({
    itemId,
    accessToken: encrypt(`token-${itemId}`),
    institutionName: 'Test Bank',
    ...over,
  });
}

export async function seedAccount(
  accountId: string,
  itemId: string,
  over: Partial<typeof accounts.$inferInsert> = {},
): Promise<void> {
  await db.insert(accounts).values({ accountId, itemId, name: 'Blue Cash Preferred®', ...over });
}

export async function seedCardWithCategory(): Promise<{ cardId: number; categoryId: number }> {
  const [card] = await db
    .insert(cards)
    .values({
      slug: 'amex-bcp',
      name: 'Blue Cash Preferred',
      type: 'cashback',
      plaidAccountNames: ['Blue Cash Preferred®'],
    })
    .returning({ id: cards.id });
  if (!card) throw new Error('card seed failed');
  const [category] = await db
    .insert(cardCategories)
    .values({ cardId: card.id, name: 'Groceries', rate: '6' })
    .returning({ id: cardCategories.id });
  if (!category) throw new Error('card category seed failed');
  return { cardId: card.id, categoryId: category.id };
}

export async function seedCreditCategory(name = 'Refund'): Promise<number> {
  const [row] = await db
    .insert(creditCategories)
    .values({ name })
    .returning({ id: creditCategories.id });
  if (!row) throw new Error('credit category seed failed');
  return row.id;
}

export function providerTxn(
  transactionId: string,
  over: Partial<ProviderTransaction> = {},
): ProviderTransaction {
  return {
    transactionId,
    accountId: 'acc-1',
    date: '2026-09-01',
    name: 'COFFEE SHOP 42',
    merchantName: 'Coffee Shop',
    amount: 4.5,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    category: null,
    pending: false,
    pendingTransactionId: null,
    raw: { transaction_id: transactionId },
    ...over,
  };
}

export async function transactionRow(transactionId: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.transactionId, transactionId));
  return row;
}

export async function itemRow(itemId: string) {
  const [row] = await db.select().from(items).where(eq(items.itemId, itemId));
  if (!row) throw new Error(`item ${itemId} not found`);
  return row;
}
