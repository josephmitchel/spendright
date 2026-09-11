import { eq, sql } from 'drizzle-orm';
import { accounts, type AccountRow, type CardRow } from '@/db/schema';
import { loadCardCatalog } from '@/lib/card-catalog';
import { matchCard } from '@/lib/cards';
import { db, type DbTransaction } from '@/lib/db';
import { logError, logWarn } from '@/lib/log';
import type { ProviderAccount } from '@/lib/provider-types';
import { servedAccountColumns } from '@/lib/served-columns';

export { servedAccountColumns };

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
    unofficialCurrencyCode: plaidAccount.unofficialCurrencyCode,
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
  const matched = matchCard(cardList, plaidAccount);
  const [existing] = await tx
    .select({ cardId: accounts.cardId })
    .from(accounts)
    .where(eq(accounts.accountId, plaidAccount.accountId));
  // A name drift must never silently unlink a matched card (the account page
  // would fall back to the unsupported view and hide its history); matches
  // only ever add or move a link. `npm run seed:cards` remains the deliberate
  // way to recompute matches from scratch.
  const cardId = matched?.id ?? existing?.cardId ?? null;
  if (matched === null && existing?.cardId != null) {
    logWarn(
      `account ${plaidAccount.accountId} ("${plaidAccount.name}") no longer matches any card's ` +
        'account names — keeping its existing card link',
    );
  }
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
// only its own rows.
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
