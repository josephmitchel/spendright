import { eq, inArray, sql } from 'drizzle-orm';
import { Transaction as PlaidTransaction } from 'plaid';
import {
  accounts,
  cardCategories,
  creditCategories,
  items,
  transactions,
  type ItemRow,
} from '@/db/schema';
import { isInflowAmount } from '@/lib/amounts';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { syncTransactions } from '@/lib/plaid';

function toTransactionRow(txn: PlaidTransaction, itemId: string) {
  return {
    transactionId: txn.transaction_id,
    accountId: txn.account_id,
    itemId,
    date: txn.date,
    name: txn.name ?? null,
    merchantName: txn.merchant_name ?? null,
    amount: String(txn.amount),
    isoCurrencyCode: txn.iso_currency_code ?? null,
    category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
    pending: txn.pending ?? null,
    plaidTransaction: txn,
  };
}

export interface SyncItemResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
}

export async function syncItem(item: ItemRow): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor);

  await db.transaction(async (tx) => {
    // Plaid replaces a pending transaction with a posted one under a NEW
    // transaction_id (old id in `removed`, new one in `added` with
    // pending_transaction_id set). Carry the user's category/rate over
    // before the pending row is deleted below.
    //
    // Known limitation, accepted: this only works while the pending row still
    // exists, i.e. when the removal and its posted replacement arrive in the
    // same syncItem call. Pagination cannot split them — syncTransactions
    // drains the whole has_more loop before this transaction opens — so it
    // would take Plaid reporting the two halves under different cursors,
    // which its update model does not normally do. If it ever happens the
    // selection is silently lost, and recovering it would mean persisting the
    // carry keyed by pending id (a table this app does not have). Not built:
    // the failure is speculative and the cost is a schema the rest of the
    // sync path has no other use for.
    const pendingIds = added
      .map((txn) => txn.pending_transaction_id)
      .filter((id): id is string => Boolean(id));
    const carried = new Map<
      string,
      { cardCategoryId: number | null; rewardRate: string | null; creditCategoryId: number | null }
    >();
    if (pendingIds.length > 0) {
      // `for update`, because this read DECIDES the carry and the rows it reads
      // are deleted at the end of this transaction. Unlocked, the window
      // between the two is the whole upsert loop below, and a PATCH landing in
      // it takes the row's own `for update` unopposed, writes the user's
      // category, commits and answers 200 — after this read already concluded
      // there was nothing to carry. The posted row is then inserted bare and
      // the pending row deleted, so the selection is destroyed with a success
      // already on screen, and destroyed for good (see the note above: a
      // dropped carry is unrecoverable).
      //
      // The lock does not save that pick — it makes the loss honest. PATCH
      // blocks instead, and once this commits it finds the row gone and returns
      // its existing 404, or gives up first on its 3s lock_timeout and returns
      // the retryable 503. Either way the user is told to pick again on the
      // posted row rather than believing a write that no longer exists.
      // Scoped to just the pending rows being replaced in this batch, so it
      // costs nothing on a sync that has none.
      const pendingRows = await tx
        .select({
          transactionId: transactions.transactionId,
          accountId: transactions.accountId,
          cardCategoryId: transactions.cardCategoryId,
          rewardRate: transactions.rewardRate,
          creditCategoryId: transactions.creditCategoryId,
        })
        .from(transactions)
        .where(inArray(transactions.transactionId, pendingIds))
        .for('update');

      // A card category stops being carryable only when it belongs to a card
      // that is NOT the account's — the account moved to a different card
      // since the user categorized the pending row, so its categories no
      // longer apply. An account matched to no card (card_id NULL) is an
      // unsupported account, not a wrong one: the selection is preserved and
      // simply stays hidden until the account matches a card again. See the
      // supported-account rule at the top of
      // src/app/accounts/[accountId]/page.tsx; /api/exchange and
      // scripts/seed-cards.ts follow the same rule when they clear links.
      // Carrying is the last chance to keep the selection — Plaid reposts a
      // pending row under a new transaction_id and the old row is deleted
      // below — so a dropped carry is unrecoverable.
      const pendingCardCategoryIds = [
        ...new Set(pendingRows.map((r) => r.cardCategoryId).filter((id) => id !== null)),
      ];
      const categoryCardIds = new Map<number, number>();
      const accountCardIds = new Map<string, number | null>();
      if (pendingCardCategoryIds.length > 0) {
        const categoryRows = await tx
          .select({ id: cardCategories.id, cardId: cardCategories.cardId })
          .from(cardCategories)
          .where(inArray(cardCategories.id, pendingCardCategoryIds));
        for (const category of categoryRows) categoryCardIds.set(category.id, category.cardId);

        const accountRows = await tx
          .select({ accountId: accounts.accountId, cardId: accounts.cardId })
          .from(accounts)
          .where(inArray(accounts.accountId, [...new Set(pendingRows.map((r) => r.accountId))]));
        for (const account of accountRows) accountCardIds.set(account.accountId, account.cardId);
      }

      // The credit side needs the same existence check, minus the card
      // comparison: credit categories are global, so no card change can
      // invalidate one — only deletion from the seed does
      // (scripts/seed-cards.ts drops every credit category not in the seed
      // list, and the FK set-nulls the links it can see). A carry is an
      // INSERT of a fresh row that the FK cannot have cleaned up, so a stale
      // id here aborts the whole sync — including the cursor update — and
      // every later sync replays into the same failure.
      const pendingCreditCategoryIds = [
        ...new Set(pendingRows.map((r) => r.creditCategoryId).filter((id) => id !== null)),
      ];
      const liveCreditCategoryIds = new Set<number>();
      if (pendingCreditCategoryIds.length > 0) {
        const creditRows = await tx
          .select({ id: creditCategories.id })
          .from(creditCategories)
          .where(inArray(creditCategories.id, pendingCreditCategoryIds));
        for (const category of creditRows) liveCreditCategoryIds.add(category.id);
      }

      for (const row of pendingRows) {
        // Both lookups are compared against undefined explicitly: a plain
        // equality would read two misses as "still valid" and carry a category
        // id that no longer exists into the insert, failing the whole sync on
        // the FK. The rows come from three separate statement snapshots under
        // READ COMMITTED, so a concurrent seed run can produce that.
        const categoryCardId =
          row.cardCategoryId !== null ? categoryCardIds.get(row.cardCategoryId) : undefined;
        const accountCardId = accountCardIds.get(row.accountId);
        const cardCategoryStillValid =
          categoryCardId !== undefined &&
          accountCardId !== undefined &&
          (accountCardId === null || accountCardId === categoryCardId);
        const creditCategoryStillValid =
          row.creditCategoryId !== null && liveCreditCategoryIds.has(row.creditCategoryId);
        // A recorded rate carries on its own, with no live category link
        // required — hence the third arm of this condition and the
        // unconditional rewardRate below. reward_rate is a historical
        // snapshot of what the purchase earned (src/db/schema.ts), and the
        // posted row IS that purchase, just re-identified by Plaid: the
        // pending row holding the rate is deleted a few statements down, so
        // anything not carried here is lost for good. Both cases that sever a
        // link keep the rate everywhere else — the FK set-null when a category
        // leaves the seed file, and the card-move wipe in
        // scripts/seed-cards.ts, which logs "(rates kept)" — so requiring a
        // valid category here would make this the one path that erases them.
        if (cardCategoryStillValid || creditCategoryStillValid || row.rewardRate !== null) {
          carried.set(row.transactionId, {
            cardCategoryId: cardCategoryStillValid ? row.cardCategoryId : null,
            rewardRate: row.rewardRate,
            creditCategoryId: creditCategoryStillValid ? row.creditCategoryId : null,
          });
        }
      }
    }

    const upserts = [...added, ...modified];
    for (const txn of upserts) {
      const row = toTransactionRow(txn, item.itemId);
      const carry = txn.pending_transaction_id
        ? carried.get(txn.pending_transaction_id)
        : undefined;
      // Only carry a selection whose kind matches the posted amount's sign:
      // card categories are spend-side (amount >= 0), credit categories are
      // inflow-side (amount < 0). A pending→posted sign flip drops the carry.
      // Carrying just that kind's columns keeps a rate off an inflow row by
      // construction (rewardRate belongs to card categories only) — and a rate
      // dropped by a flip to inflow is the one case where losing it is right,
      // for the same reason the onConflictDoUpdate below clears it on a flip:
      // a rate on an inflow row never described real earnings.
      //
      // The spend side takes the carry on EITHER column: an orphaned rate with
      // no surviving category is still history worth keeping (see the carry
      // loop above), so it must not need a cardCategoryId to ride along.
      const isInflow = isInflowAmount(row.amount);
      const carriedValues = isInflow
        ? carry?.creditCategoryId != null
          ? { creditCategoryId: carry.creditCategoryId }
          : null
        : carry?.cardCategoryId != null || carry?.rewardRate != null
          ? { cardCategoryId: carry.cardCategoryId, rewardRate: carry.rewardRate }
          : null;
      await tx
        .insert(transactions)
        .values(carriedValues ? { ...row, ...carriedValues } : row)
        .onConflictDoUpdate({
          target: transactions.transactionId,
          // `set` excludes the matching kind's category columns so re-syncs
          // never overwrite a user's selection — but a `modified` update that
          // flips the amount's sign must clear the now-wrong-kind selection,
          // or the update would violate the DB sign constraint. On a flip to
          // inflow the rewardRate goes too: unlike a severed category link,
          // where the rate stays as history, a rate on an inflow row never
          // described real earnings.
          set: {
            ...row,
            updatedAt: sql`now()`,
            ...(isInflow ? { cardCategoryId: null, rewardRate: null } : { creditCategoryId: null }),
          },
        });
    }

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    await tx
      .update(items)
      .set({ cursor, error: null, updatedAt: sql`now()` })
      .where(eq(items.itemId, item.itemId));
  });

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
  };
}
