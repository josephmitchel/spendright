import { sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { accounts, type CardRow } from '@/db/schema';
import { matchCard } from '@/lib/cards';
import type { db } from '@/lib/db';

// The handle drizzle hands to a db.transaction callback. Both callers of
// upsertAccount already hold one — and both open it PER ACCOUNT, so a single
// bad account can neither roll back its siblings nor take down the caller's
// other work (syncItem used to do the whole sync, cursor included, in the one
// transaction this ran in; see the note there). This module never opens its
// own.
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

// The single definition of how one Plaid account is written to the database,
// shared by /api/exchange and syncItem. It lived only in /api/exchange, which
// made accounts a link-time-only table: /api/sync never touched it, so an
// account the bank added to an already-linked item (Plaid's
// NEW_ACCOUNTS_AVAILABLE) never got a row, its transactions failed the
// transactions.account_id foreign key, and the failed insert rolled back the
// whole sync transaction INCLUDING the cursor update — so every later sync
// replayed the same batch into the same failure and that item stayed broken
// until it was re-linked by hand. Refreshing accounts on every sync also keeps
// the stored balances current, which nothing else did.
//
// Both callers treat a failure here as this account's problem alone: they log
// it and carry on. That is what keeps the fix from re-creating the failure it
// was written for — an account that cannot be stored now costs only its own
// rows for one sync (skipped, with the cursor held back so they are re-offered
// — see syncItem), never the item.
export async function upsertAccount(
  tx: DbTransaction,
  plaidAccount: AccountBase,
  itemId: string,
  cardList: CardRow[],
): Promise<void> {
  // Re-matched on EVERY sync, and the `on conflict do update` at the bottom
  // writes the result over the stored card_id — so a Plaid account rename that
  // no longer matches anything in cards.seed.ts drops the account back to "card
  // not supported" on the next sync, not only on a re-link. Intended (decided
  // 2026-09-04): an account whose card is not known cannot be scored, and it
  // must not go on looking usable on the strength of a match that no longer
  // holds. Nothing is destroyed by the demotion — this function writes the
  // accounts row and nothing else — and the account comes back the moment
  // cards.seed.ts covers the new name. Do not add a "keep the existing
  // card_id" branch here.
  //
  // And nothing else is the rule (decided 2026-09-04, replacing the card-move
  // wipe that used to live here). An account's card is a fixed fact; a null
  // match is a temporary naming mismatch and a match to a different card is
  // not a scenario this app supports. Neither is a reason to clear a saved
  // category or rate on the account's transactions: a categorization is a
  // historical record, and no card-side change rewrites it. See the
  // supported-account rule at the top of src/app/accounts/[accountId]/page.tsx.
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
