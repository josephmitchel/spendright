import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { accounts, cardCategories, transactions, type CardRow } from '@/db/schema';
import { matchCard } from '@/lib/cards';
import type { db } from '@/lib/db';

// The handle drizzle hands to a db.transaction callback. Both callers of
// upsertAccount already hold one — and both open it PER ACCOUNT, so a single
// bad account can neither roll back its siblings nor take down the caller's
// other work (syncItem used to do the whole sync, cursor included, in the one
// transaction this ran in; see the note there). This module never opens its
// own: the wipe below and the account write have to commit or fail together
// (see the note inside).
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
  // holds. Nothing is destroyed by the demotion — the wipe below is skipped
  // when cardId is null, and each transaction's recorded reward_rate is a
  // snapshot either way — and the account comes back the moment cards.seed.ts
  // covers the new name. Do not add a "keep the existing card_id" branch here.
  const cardId = matchCard(cardList, plaidAccount.name ?? null)?.id ?? null;
  const accountValues = toAccountRow(plaidAccount, itemId, cardId);

  // A category link belonging to some other card is exactly what a move
  // between cards leaves behind — including a move that passes through
  // "no card", when a Plaid rename drops the match and a later link
  // matches a different card. Keying off the links themselves rather
  // than off the stored card_id catches both shapes; the same rule runs
  // in scripts/seed-cards.ts. An account with no card clears nothing:
  // Plaid account names change cosmetically, and a rename must not
  // destroy the user's selections — the account is merely unsupported
  // until the match comes back (see the supported-account rule at the
  // top of src/app/accounts/[accountId]/page.tsx), and a card actually
  // deleted from the seed already set-nulls those links by FK. Each
  // recorded reward_rate stays either way: it is a snapshot of what that
  // transaction earned. Credit categories are global, so they survive.
  //
  // The wipe is unconditional rather than gated on the card_id changing, and
  // that is the point of keying off the links: a comparison against the stored
  // card_id cannot see a stale link that the stored id agrees with. It costs
  // one update per account per sync that normally matches nothing.
  //
  // Destructive, so it must not commit unless the card change that justifies
  // it does too — hence the caller's transaction: otherwise a later failure
  // leaves selections gone while the account still points at the old card.
  //
  // That transaction is per account and holds nothing else, which is what keeps
  // the row locks this UPDATE takes short-lived. They overlap the ones the
  // reconcile in scripts/seed-cards.ts takes, in a different order — a deadlock
  // window that file calls narrowed, not cured — and running this inside
  // syncItem's whole-sync transaction had widened it right back out, with the
  // sync's cursor as the collateral. A 40P01 now aborts one account's upsert,
  // which its caller catches and retries on the next sync.
  if (cardId !== null) {
    const wiped = await tx
      .update(transactions)
      .set({ cardCategoryId: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(transactions.accountId, plaidAccount.account_id),
          inArray(
            transactions.cardCategoryId,
            tx
              .select({ id: cardCategories.id })
              .from(cardCategories)
              .where(ne(cardCategories.cardId, cardId)),
          ),
        ),
      )
      .returning({ id: transactions.id });
    if (wiped.length > 0) {
      console.log(
        `account "${plaidAccount.name}" changed card: cleared card categories on ${wiped.length} transaction(s) (rates kept)`,
      );
    }
  }

  await tx
    .insert(accounts)
    .values(accountValues)
    .onConflictDoUpdate({
      target: accounts.accountId,
      set: { ...accountValues, updatedAt: sql`now()` },
    });
}
