import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cardCategories, creditCategories, transactions } from '@/db/schema';
import { isInflowAmount } from '@/lib/amounts';
import { db } from '@/lib/db';
import { errorResponse, pgErrorCode } from '@/lib/errors';

function badRequest(message: string) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 });
}

// A response decided INSIDE the db transaction. Thrown rather than returned:
// db.transaction commits whenever its callback returns and rolls back only on
// a throw (node_modules/drizzle-orm/node-postgres/session.cjs), so a plain
// `return badRequest(...)` commits the very request the handler is rejecting.
// Nothing is written before any of the checks below today, so returning would
// still be harmless — throwing is what keeps it harmless the first time a
// write moves ahead of a check. Rejections raised before the transaction
// opens are returned normally; there is nothing to roll back.
class RejectedRequest extends Error {
  response: NextResponse;
  constructor(response: NextResponse) {
    super('rejected request');
    this.response = response;
  }
}

function isValidId(raw: unknown): raw is number | null {
  return (
    raw === null ||
    (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 2147483647)
  );
}

// Set or clear a transaction's category. Exactly one key must be present:
// - { cardCategoryId: number | null }   spend category (positive amounts)
// - { creditCategoryId: number | null } inflow category (negative amounts)
// Each key writes only its own kind's columns (null clears just that kind);
// the DB sign constraint keeps a row from ever holding the other kind.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest('Request body must be valid JSON');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return badRequest('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const hasCardKey = 'cardCategoryId' in record;
    const hasCreditKey = 'creditCategoryId' in record;
    if (hasCardKey === hasCreditKey) {
      return badRequest('Provide exactly one of cardCategoryId or creditCategoryId');
    }
    const key = hasCardKey ? 'cardCategoryId' : 'creditCategoryId';
    const raw = record[key];
    if (!isValidId(raw)) {
      return badRequest(`${key} must be a positive integer or null`);
    }
    const categoryId = raw;

    // One transaction, with the row locked for the whole read-validate-write.
    // The sign check below decides which category kind is legal, and a
    // concurrent sync can flip a row's amount (Plaid `modified`) or delete it
    // outright (a pending row reposting under a new id) — without the lock the
    // check would be stale and the write would trip the DB sign constraint,
    // surfacing as a 500 instead of this handler's 400/404.
    return await db.transaction(async (tx) => {
      // Bound the wait for that lock. The writers to worry about are not
      // network-bound: syncItem finishes every Plaid round trip before it
      // opens its transaction (src/lib/plaid.ts drains the whole has_more
      // loop, src/lib/sync.ts then calls db.transaction), so what holds these
      // rows is its row-at-a-time upsert loop, and scripts/seed-cards.ts holds
      // them for a whole-table `update transactions set reward_rate` — in its
      // own transaction, ahead of the reconcile, which is a lock-ordering
      // decision explained where it happens and does not shorten how long the
      // statement itself holds these rows. Either can run long on a big item, and an
      // unbounded wait pins a pool connection for the duration; the pg pool
      // defaults to 10 connections, so a handful of concurrent PATCHes during
      // a sync would stall every other route. Failing fast turns that into one
      // retryable 503 instead (see the catch below).
      await tx.execute(sql`set local lock_timeout = '3s'`);
      const [transaction] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, transactionId))
        .for('update');
      if (!transaction) {
        throw new RejectedRequest(
          NextResponse.json(
            { error: { code: 'NOT_FOUND', message: 'Transaction not found' } },
            { status: 404 },
          ),
        );
      }
      const isInflow = isInflowAmount(transaction.amount);

      let updateSet:
        | { cardCategoryId: number | null; rewardRate: string | null }
        | { creditCategoryId: number | null };
      let cardCategoryName: string | null = null;
      let creditCategoryName: string | null = null;

      if (hasCardKey) {
        if (categoryId !== null) {
          if (isInflow) {
            throw new RejectedRequest(
              badRequest(
                'Negative-amount transactions take a credit category, not a card category',
              ),
            );
          }
          // `for share`, not a plain read: the transaction row's own lock makes
          // the read-validate-write atomic against other writers of that row,
          // but the card this write is validated against lives here, and an
          // unlocked read of it leaves a hole the wipes cannot cover. A seed
          // re-matching this account from card X to card Y wipes its
          // transactions FIRST — passing over this row, which is uncategorized
          // and therefore unmatched and unlocked — and updates accounts.card_id
          // after. Read without a lock, this sees the pre-update card_id under
          // READ COMMITTED, validates a card-X category against it and commits
          // a category belonging to the card the account just left, behind the
          // wipe that would have caught it.
          //
          // `share` rather than `update`: this only has to stop the row
          // changing underneath, not claim it. Cheap in practice — the seed
          // writes accounts rows only when a match actually changes, so nothing
          // is held here on an ordinary run — and when it does contend, the
          // lock_timeout above turns the wait into the retryable 503 rather
          // than a stall. Lock ORDER is transactions-then-accounts here, which
          // is the order scripts/seed-cards.ts and /api/exchange both take
          // (each wipes transactions before writing the account row), so this
          // adds no cycle.
          const [account] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.accountId, transaction.accountId))
            .for('share');
          // An account with no matched card is unsupported, so the UI offers
          // no picker for it at all (see the supported-account rule at the top
          // of src/app/accounts/[accountId]/page.tsx). Reaching here means a
          // client went around that, so refuse rather than invent a card.
          if (!account?.cardId) {
            throw new RejectedRequest(badRequest('This account has no matched card definition'));
          }
          const [category] = await tx
            .select()
            .from(cardCategories)
            .where(eq(cardCategories.id, categoryId));
          if (!category || category.cardId !== account.cardId) {
            throw new RejectedRequest(
              badRequest("cardCategoryId does not belong to this account's card"),
            );
          }
          updateSet = { cardCategoryId: category.id, rewardRate: category.rate };
          cardCategoryName = category.name;
        } else {
          // Clearing the category clears the recorded rate with it. This is the
          // one writer in the codebase that destroys a reward_rate snapshot, and
          // it is deliberate: src/db/schema.ts, syncItem's carry and the seed's
          // card-move wipe all KEEP a rate whose category link the system
          // severed, because the user's pick still described a real purchase.
          // Here the user is retracting the pick itself, so the rate never
          // described anything. Keeping it would also strand it — a rate on a
          // row with no category has no picker and no code path that could ever
          // remove it. (Migration 0003 records the same carve-out as "PATCH
          // clear aside".)
          updateSet = { cardCategoryId: null, rewardRate: null };
        }
      } else {
        if (categoryId !== null) {
          if (!isInflow) {
            throw new RejectedRequest(
              badRequest(
                'Positive-amount transactions take a card category, not a credit category',
              ),
            );
          }
          // The same supported-account check as the card branch above, for the
          // rule rather than for the data: credit categories are global, so an
          // unmatched account cannot make one WRONG the way it makes a card
          // category wrong. But the supported-account rule is stated as an
          // absolute — "there is therefore no such thing as categorizing a
          // transaction on an account with no card" — and with the check on one
          // branch only it held for the credit kind purely because the UI hides
          // the table (src/app/accounts/[accountId]/page.tsx renders "Card not
          // supported" and no pickers). An invariant the writer does not enforce
          // is one the next client can break.
          //
          // Only on set, matching the card branch: clearing is always allowed,
          // since refusing it would strand a selection made while the account
          // was still matched.
          // Locked like the card branch's read, for consistency rather than for
          // a race of its own: a credit category is global, so a card change
          // cannot invalidate the value written here. Reading the row two
          // different ways in one handler is the kind of difference a later
          // reader has to stop and account for, and there is nothing to find.
          const [account] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.accountId, transaction.accountId))
            .for('share');
          if (!account?.cardId) {
            throw new RejectedRequest(badRequest('This account has no matched card definition'));
          }
          const [category] = await tx
            .select()
            .from(creditCategories)
            .where(eq(creditCategories.id, categoryId));
          if (!category) {
            throw new RejectedRequest(badRequest('creditCategoryId does not exist'));
          }
          updateSet = { creditCategoryId: category.id };
          creditCategoryName = category.name;
        } else {
          updateSet = { creditCategoryId: null };
        }
      }

      const [updated] = await tx
        .update(transactions)
        .set({ ...updateSet, updatedAt: sql`now()` })
        .where(eq(transactions.transactionId, transactionId))
        .returning();

      // The untouched kind may still hold a category (e.g. a null clear of the
      // card kind on an inflow row) — resolve its name so the response always
      // reflects the full row.
      if (updated.cardCategoryId !== null && cardCategoryName === null) {
        const [category] = await tx
          .select()
          .from(cardCategories)
          .where(eq(cardCategories.id, updated.cardCategoryId));
        cardCategoryName = category?.name ?? null;
      }
      if (updated.creditCategoryId !== null && creditCategoryName === null) {
        const [category] = await tx
          .select()
          .from(creditCategories)
          .where(eq(creditCategories.id, updated.creditCategoryId));
        creditCategoryName = category?.name ?? null;
      }

      return NextResponse.json({
        transaction: { ...updated, cardCategoryName, creditCategoryName },
      });
    });
  } catch (err) {
    // Not an error: a rejection raised inside the transaction so that it rolls
    // back (see RejectedRequest). The response was already built at the point
    // the check failed; nothing here decides it.
    if (err instanceof RejectedRequest) return err.response;
    // Read through pgErrorCode, never off `err` directly: drizzle wraps the pg
    // error, so a direct `err.code` check matches nothing and every case below
    // escapes as an opaque 500 (errorResponse no longer leaks the query text,
    // which makes an unmapped SQLSTATE that much harder to diagnose from the
    // client — one more reason to map the ones that are expected).
    const code = pgErrorCode(err);
    // Two ways the database refuses a request that was itself fine. Nothing is
    // wrong with what the client sent, so both say "try again" rather than
    // reporting a 500.
    //
    // 55P03 lock_not_available: the `set local lock_timeout` above expired
    // because a sync (or seed) holds this row.
    //
    // 40P01 deadlock_detected: this handler and scripts/seed-cards.ts take the
    // same two locks in opposite orders. PATCH locks the transactions row FOR
    // UPDATE and then needs FOR KEY SHARE on card_categories for the FK check on
    // its update; the seed's category delete locks the card_categories row first
    // and then — the FK being `on delete set null` — has to update the
    // transactions rows pointing at it. Postgres breaks the cycle by aborting
    // one side, and it gets there before the 3s lock_timeout above, since
    // deadlock_timeout defaults to 1s. Retrying is right: the seed run that
    // caused it is short-lived. Note this is NOT the cycle the seed's backfill
    // comment describes — that one (seed vs. syncItem) was NARROWED, not closed,
    // by moving the backfill out of the reconcile transaction: the reconcile
    // still locks transactions rows through both FK cascades and the per-account
    // wipe. This one runs through the FK cascade against PATCH and is unaffected
    // by that split either way.
    if (code === '55P03' || code === '40P01') {
      return NextResponse.json(
        {
          error: {
            code: 'LOCKED',
            message: 'This transaction is being synced right now — try again in a moment',
          },
        },
        { status: 503 },
      );
    }
    // 23503 foreign_key_violation: the category passed every check above and
    // then stopped existing before the update landed. The row lock taken at the
    // top covers only the transactions row — the category reads take none — so a
    // seed reconcile that drops a category from cards.seed.ts can delete it in
    // that window. It gets to: the FK is `on delete set null` (src/db/schema.ts),
    // so the seed's delete waits only on transactions that ALREADY point at the
    // category, never on one that is about to. The update writes nothing but the
    // two category columns, so this code cannot mean any other FK. Same reason
    // as the two above for catching it, but a different answer: retrying will
    // not bring the category back, so tell the client to reload.
    if (code === '23503') {
      return NextResponse.json(
        {
          error: {
            code: 'CATEGORY_REMOVED',
            message: 'That category no longer exists — reload the page and pick again',
          },
        },
        { status: 409 },
      );
    }
    return errorResponse(err);
  }
}
