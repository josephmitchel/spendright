import { eq, inArray, sql } from 'drizzle-orm';
import { AccountBase, Transaction as PlaidTransaction } from 'plaid';
import {
  accounts,
  cardCategories,
  cards,
  creditCategories,
  items,
  transactions,
  type ItemRow,
} from '@/db/schema';
import { upsertAccount } from '@/lib/accounts';
import { isInflowAmount } from '@/lib/amounts';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { getAccounts, syncTransactions } from '@/lib/plaid';

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

// How many consecutive syncs may hold an item's cursor back before the next one
// gives up and advances it, dropping the rows it could not store. See the
// cursor note at the end of syncItem for what that trades away. Five is a
// bound, not a measurement: one sync clears a transient skip, so a run this
// long is a permanent failure by any reasonable reading, and the point is to
// end it rather than to time it precisely.
export const MAX_SKIPPED_SYNCS = 5;

export interface SyncItemResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  // Rows Plaid sent for an account that exists nowhere in the database — see
  // the knownAccountIds note in syncItem. Normally 0; a non-zero value means
  // this sync wrote that condition to items.error and logged every row, and
  // either held the item's cursor back so the batch is re-offered next time or
  // — on the MAX_SKIPPED_SYNCS-th consecutive skip — dropped it (see
  // `dropped`). A caller that treats a result as "clean" must test this as
  // well as the absence of a thrown error: the item did not finish syncing
  // either way.
  skipped: number;
  // True when this sync was the MAX_SKIPPED_SYNCS-th consecutive skip and so
  // advanced the cursor anyway, dropping the held rows for good. Always false
  // when `skipped` is 0. A caller that tells the user the rows will be retried
  // has to check it — after a drop they will not be.
  dropped: boolean;
}

export interface SyncItemOptions {
  // Accounts the caller has already fetched for this item, so the accountsGet
  // below is skipped. /api/exchange passes the list it read a few lines
  // earlier; nothing else has one.
  plaidAccounts?: AccountBase[];
  // Passed through to syncTransactions — see the budget note in
  // src/lib/plaid.ts for why /api/exchange lowers it to 3.
  notReadyRetries?: number;
}

export async function syncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  // Every read here happens BEFORE the transaction opens: a Plaid round trip
  // inside one would hold a pooled connection open across the network.
  //
  // The accountsGet is best-effort. Refreshing accounts IMPROVES this sync (an
  // account the bank added, fresh balances); it is not a precondition for it,
  // so a rate limit or a partial Plaid outage must not cost the item its
  // transactions. Letting it throw failed the whole item — items.error written
  // and rendered on the home page — before transactionsSync was even
  // attempted, where before this function touched accounts at all those
  // transactions synced fine. With no list the loop below has nothing to
  // upsert and the sync carries on against the accounts already stored.
  let plaidAccounts: AccountBase[] = options?.plaidAccounts ?? [];
  if (!options?.plaidAccounts) {
    try {
      plaidAccounts = await getAccounts(accessToken);
    } catch (err) {
      console.error(
        `sync ${item.itemId}: accountsGet failed — syncing without an account refresh:`,
        err,
      );
    }
  }
  // Fetched once, not per account — matchCard works off the list. Ordered so a
  // match never depends on physical row order. Skipped entirely when there is
  // nothing to upsert (added 2026-09-04): the loop below is the only consumer,
  // and plaidAccounts is empty whenever the accountsGet above failed — so this
  // was a wasted query on exactly the sync that was already degraded.
  const cardList = plaidAccounts.length > 0 ? await db.select().from(cards).orderBy(cards.id) : [];

  // Accounts first, each in its OWN transaction, committed before the sync
  // transaction opens — the shape /api/exchange already uses. They were inside
  // the sync transaction so the transactions.account_id foreign key could never
  // see a missing account, but that put every one of upsertAccount's failure
  // modes onto the cursor: a card dropped by a concurrent `npm run seed:cards`
  // between the cardList read above and the insert leaves a dangling
  // accounts.card_id, the FK rejects it, and the whole sync — cursor included —
  // rolls back. That is the wedging failure upsertAccount was written to fix
  // (see the note on it), just moved one level up. It also held the category
  // wipe's row locks for the length of the entire sync, widening the deadlock
  // window against the seed's reconcile that scripts/seed-cards.ts warns about.
  //
  // Committing first is still correct for both things the transactions need:
  // the foreign key (the account row exists before any row referencing it is
  // inserted) and the carry read further down, which reads accounts.card_id to
  // decide whether a pending row's card category is still valid and so must see
  // THIS sync's matches, not the previous link's.
  //
  // A failure is reported and skipped rather than thrown, exactly as
  // /api/exchange does it: that account's transactions are then skipped by the
  // known-account guard below, which holds the cursor back, so the rows are
  // re-offered and the next sync retries the account.
  for (const plaidAccount of plaidAccounts) {
    try {
      await db.transaction(async (tx) => {
        await upsertAccount(tx, plaidAccount, item.itemId, cardList);
      });
    } catch (err) {
      console.error(
        `sync ${item.itemId}: could not store account ${plaidAccount.account_id} — continuing:`,
        err,
      );
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });
  // All three decided inside the transaction below, read after it commits.
  let skipped = 0;
  let dropped = false;
  let consecutiveSkippedSyncs = 0;

  await db.transaction(async (tx) => {
    // Belt and braces for the same foreign key, read back from the database
    // rather than from `plaidAccounts` so an account this sync did not see —
    // one the bank dropped from the item, whose older transactions keep
    // arriving — still counts as known and its rows are still stored. Only a
    // transaction whose account exists NOWHERE is skipped, and loudly: the
    // upsert loop above is what makes that case vanishingly unlikely, and
    // this is here because the consequence of being wrong is out of all
    // proportion to it. A rejected insert aborts this whole transaction
    // including the cursor update below, so every later sync replays the same
    // batch into the same failure and the item never syncs again.
    //
    // A skip is not a loss: the cursor update at the end of this transaction
    // is held back whenever `skipped` is non-zero, so Plaid re-offers the same
    // batch on the next sync — by which time the upsert loop above has almost
    // certainly stored the missing account. See the note there.
    //
    // Keyed on the batch's ACCOUNT IDS, not on `accounts.item_id` (fixed
    // 2026-09-03). The guard has to mirror the foreign key exactly — which is
    // `transactions.account_id -> accounts.account_id`, on a globally unique
    // column, with no item in it. Filtering by item_id instead made the guard
    // STRICTER than the constraint it stands in for, so a row the database
    // would have accepted was skipped anyway — and a skip is not free here: it
    // holds the item's cursor for MAX_SKIPPED_SYNCS syncs and then drops the
    // batch for good. An account row is re-pointed to a new item_id by
    // upsertAccount's `on conflict (account_id) do update`, so the two ids can
    // disagree; nothing in this guard's job cares which item owns the row, only
    // whether the insert below will succeed. Scoping to the batch also makes
    // this a unique-index lookup rather than a scan of every account on the
    // item.
    const batchAccountIds = [...new Set([...added, ...modified].map((txn) => txn.account_id))];
    const knownAccountIds = new Set(
      batchAccountIds.length > 0
        ? (
            await tx
              .select({ accountId: accounts.accountId })
              .from(accounts)
              .where(inArray(accounts.accountId, batchAccountIds))
          ).map((row) => row.accountId)
        : [],
    );

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
      if (!knownAccountIds.has(txn.account_id)) {
        skipped++;
        console.error(
          `sync ${item.itemId}: transaction ${txn.transaction_id} references unknown account ${txn.account_id} — skipped`,
        );
        continue;
      }
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

    // The cursor is held back when anything was skipped — but only for a
    // bounded run of syncs. It used to advance unconditionally, on the
    // reasoning that a skipped row costs one row; a skip is per ACCOUNT, not
    // per row, so an account that failed to store (in the loop above, or in
    // /api/exchange's) took with it EVERY transaction Plaid sent for it, and
    // since a re-link keeps the item's cursor, that account's entire history
    // was unrecoverable with nothing to show for it but a log line and a count.
    //
    // Holding it back costs a replay of the same batch on each sync until the
    // account exists. That replay is safe — the upserts and the delete above
    // both replay idempotently, the user's categories survive (the
    // onConflictDoUpdate leaves them alone), and new transactions still arrive
    // because the batch grows from the same cursor. The wedging this guard
    // exists to prevent — a rejected insert aborting the transaction so the
    // item never syncs again — is not back: the rows are skipped rather than
    // inserted, and everything else in the batch still commits.
    //
    // What an unbounded hold is NOT is self-limiting. The account upsert loop
    // above clears a TRANSIENT skip on the next sync, but nothing ended a
    // permanent one: an account upsertAccount can never store, or one
    // transactions/sync reports that accountsGet never returns, held the cursor
    // forever while the replayed batch only grew, and the only sign of it was a
    // line in items.error. So the hold is now capped at MAX_SKIPPED_SYNCS
    // consecutive syncs, after which the cursor advances and the held rows are
    // gone for good (decided 2026-09-03, replacing the earlier decision to hold
    // indefinitely and rely on items.error alone). The trade is deliberate and
    // it is a real loss — that account's history in this batch is not
    // recoverable, because a re-link keeps the cursor — but a permanently
    // wedged item loses everything that comes after it too, which is strictly
    // worse.
    //
    // The counter is CONSECUTIVE, read here under `for update` rather than from
    // the ItemRow the caller passed, which was read before the Plaid round
    // trips above and may be minutes stale. A clean sync resets it, so a
    // transient skip never accumulates toward the cap across unrelated
    // failures.
    //
    // Dropping resets it to 0 as well, rather than latching. An account that
    // can never be stored keeps producing new transactions, so the very next
    // sync skips again and starts a fresh run — items.error stays populated and
    // the user keeps seeing it, instead of the item going quiet after one drop.
    // That is what keeps the condition visible now that it no longer wedges.
    const [itemState] = await tx
      .select({ skippedSyncs: items.skippedSyncs })
      .from(items)
      .where(eq(items.itemId, item.itemId))
      .for('update');
    consecutiveSkippedSyncs = skipped === 0 ? 0 : (itemState?.skippedSyncs ?? 0) + 1;
    dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

    // items.error is written on the FIRST skip, not after some run of them: the
    // home page renders it under the institution, which is the only place a
    // user would ever find out, and a hold that has already started is worth
    // saying out loud. The wording carries the run length, so a line that
    // appears once and vanishes reads as the transient case and one that counts
    // upward is the wedge. HomeClient's syncSucceededAt requires !r.skipped for
    // the same reason.
    //
    // A clean sync clears it and bumps updated_at, as before: the sync
    // succeeded and the home page must not keep showing a stale failure.
    await tx
      .update(items)
      .set({
        ...(skipped === 0 || dropped ? { cursor } : {}),
        skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
        // { message } — the second of the two shapes items.error holds, the
        // one for anything that is not a Plaid error body. See
        // itemErrorMessage in src/components/HomeClient.tsx.
        error:
          skipped === 0
            ? null
            : {
                message: dropped
                  ? `${skipped} transaction(s) arrived for accounts that are not stored, after ${MAX_SKIPPED_SYNCS} syncs of holding them back. They have been dropped so this connection keeps syncing, and they cannot be recovered — check the server log for the accounts involved.`
                  : `${skipped} transaction(s) arrived for accounts that are not stored — they are being held and re-offered on every sync (${consecutiveSkippedSyncs} of ${MAX_SKIPPED_SYNCS}). If this line does not clear, the account cannot be stored: check the server log. After ${MAX_SKIPPED_SYNCS} syncs they are dropped so the connection keeps working.`,
              },
        updatedAt: sql`now()`,
      })
      .where(eq(items.itemId, item.itemId));
  });

  // One summary line to go with the per-row errors above. The user-facing half
  // of this is items.error, written in the transaction above; this is the half
  // that names the item and pairs with the per-row lines, which is what someone
  // diagnosing a skip actually needs — and on a drop it is the only lasting
  // record of which rows went, since the next clean sync clears items.error.
  if (skipped > 0) {
    if (dropped) {
      console.error(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — held for ${MAX_SKIPPED_SYNCS} syncs and now DROPPED, cursor advanced; these rows are gone (see the per-row lines above for the accounts)`,
      );
    } else {
      console.warn(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — cursor held back, this batch will be re-offered on the next sync (${MAX_SKIPPED_SYNCS - consecutiveSkippedSyncs} more before it is dropped)`,
      );
    }
  }

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    skipped,
    dropped,
  };
}
