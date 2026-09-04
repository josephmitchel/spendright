import { sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { accounts, type CardRow } from '@/db/schema';
import { matchCard } from '@/lib/cards';
import type { db } from '@/lib/db';

// The handle drizzle passes to a db.transaction callback. Callers open one per
// account; this module never opens its own.
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toAccountRow(plaidAccount: AccountBase, itemId: string, cardId: number | null) {
  return {
    accountId: plaidAccount.account_id,
    itemId,
    name: plaidAccount.name ?? null,
    officialName: plaidAccount.official_name ?? null,
    mask: plaidAccount.mask ?? null,
    type: plaidAccount.type ?? null,
    subtype: plaidAccount.subtype ?? null,
    balanceAvailable:
      plaidAccount.balances.available != null ? String(plaidAccount.balances.available) : null,
    balanceCurrent:
      plaidAccount.balances.current != null ? String(plaidAccount.balances.current) : null,
    balanceLimit: plaidAccount.balances.limit != null ? String(plaidAccount.balances.limit) : null,
    isoCurrencyCode: plaidAccount.balances.iso_currency_code ?? null,
    cardId,
  };
}

// The single definition of how one Plaid account is written, shared by
// /api/exchange and syncItem. Callers treat a failure here as this account's
// problem alone. Design: accounts-refreshed-per-sync.
export async function upsertAccount(
  tx: DbTransaction,
  plaidAccount: AccountBase,
  itemId: string,
  cardList: CardRow[],
): Promise<void> {
  // card_id is re-matched and overwritten on every sync; nothing else on the
  // account's transactions is touched. Design: rematch-on-every-sync,
  // selections-are-user-owned.
  const cardId = matchCard(cardList, plaidAccount.name ?? null)?.id ?? null;
  const accountValues = toAccountRow(plaidAccount, itemId, cardId);

  await tx
    .insert(accounts)
    .values(accountValues)
    .onConflictDoUpdate({
      target: accounts.accountId,
      set: { ...accountValues, updatedAt: sql`now()` },
    });
}
