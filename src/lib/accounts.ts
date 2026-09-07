import { getTableColumns, sql } from 'drizzle-orm';
import { accounts, type AccountRow, type CardRow } from '@/db/schema';
import { loadCardCatalog } from '@/lib/card-catalog';
import { matchCard } from '@/lib/cards';
import { db, type DbTransaction } from '@/lib/db';
import { logError } from '@/lib/log';
import type { ProviderAccount } from '@/lib/provider-types';

const accountColumns = getTableColumns(accounts);

// Design: typed-api-contract.
export const servedAccountColumns = {
  id: accountColumns.id,
  accountId: accountColumns.accountId,
  itemId: accountColumns.itemId,
  name: accountColumns.name,
  officialName: accountColumns.officialName,
  mask: accountColumns.mask,
  type: accountColumns.type,
  subtype: accountColumns.subtype,
  balanceAvailable: accountColumns.balanceAvailable,
  balanceCurrent: accountColumns.balanceCurrent,
  balanceLimit: accountColumns.balanceLimit,
  isoCurrencyCode: accountColumns.isoCurrencyCode,
  cardId: accountColumns.cardId,
  createdAt: accountColumns.createdAt,
  updatedAt: accountColumns.updatedAt,
} satisfies Partial<typeof accountColumns>;

export type ServedAccountRow = Pick<
  AccountRow,
  keyof typeof servedAccountColumns & keyof AccountRow
>;

function toAccountRow(plaidAccount: ProviderAccount, itemId: string, cardId: number | null) {
  return {
    accountId: plaidAccount.accountId,
    itemId,
    name: plaidAccount.name,
    officialName: plaidAccount.officialName,
    mask: plaidAccount.mask,
    type: plaidAccount.type,
    subtype: plaidAccount.subtype,
    balanceAvailable:
      plaidAccount.balanceAvailable != null ? String(plaidAccount.balanceAvailable) : null,
    balanceCurrent:
      plaidAccount.balanceCurrent != null ? String(plaidAccount.balanceCurrent) : null,
    balanceLimit: plaidAccount.balanceLimit != null ? String(plaidAccount.balanceLimit) : null,
    isoCurrencyCode: plaidAccount.isoCurrencyCode,
    cardId,
  };
}

export type StoreFailure = { account: ProviderAccount; error: unknown };

async function upsertAccount(
  tx: DbTransaction,
  plaidAccount: ProviderAccount,
  itemId: string,
  cardList: CardRow[],
): Promise<void> {
  // Design: rematch-on-every-sync, selections-are-user-owned.
  const cardId = matchCard(cardList, plaidAccount.name)?.id ?? null;
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
// only its own rows. Design: accounts-refreshed-per-sync, initial-sync-reported-not-thrown.
async function storeAccounts(
  plaidAccounts: ProviderAccount[],
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
        `Failed to store account ${plaidAccount.accountId} for item ${itemId} — continuing:`,
        err,
      );
      failures.push({ account: plaidAccount, error: err });
    }
  }
  return failures;
}

export async function refreshItemAccounts(
  itemId: string,
  plaidAccounts: ProviderAccount[],
): Promise<StoreFailure[]> {
  const cardList = await loadCardCatalog(db);
  return storeAccounts(plaidAccounts, itemId, cardList);
}
