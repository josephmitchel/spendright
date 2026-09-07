import { sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { accounts, type CardRow } from '@/db/schema';
import { matchCard } from '@/lib/cards';
import { db, type DbTransaction } from '@/lib/db';
import { logError } from '@/lib/log';

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

// One failed account store, with the caught error kept for the caller's
// user-facing message.
export type StoreFailure = { account: AccountBase; error: unknown };

// Design: accounts-refreshed-per-sync.
async function upsertAccount(
  tx: DbTransaction,
  plaidAccount: AccountBase,
  itemId: string,
  cardList: CardRow[],
): Promise<void> {
  // card_id is re-matched and overwritten on every write.
  // Design: rematch-on-every-sync, selections-are-user-owned.
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

// Each account commits in its own transaction, so one failing account costs
// only its own rows; failures are logged and returned, never thrown.
// Design: accounts-refreshed-per-sync, initial-sync-reported-not-thrown.
export async function storeAccounts(
  plaidAccounts: AccountBase[],
  itemId: string,
  cardList: CardRow[],
): Promise<StoreFailure[]> {
  const failures: StoreFailure[] = [];
  for (const plaidAccount of plaidAccounts) {
    try {
      await db.transaction(async (tx) => {
        await upsertAccount(tx, plaidAccount, itemId, cardList);
      });
    } catch (err) {
      logError(
        `Failed to store account ${plaidAccount.account_id} for item ${itemId} — continuing:`,
        err,
      );
      failures.push({ account: plaidAccount, error: err });
    }
  }
  return failures;
}
