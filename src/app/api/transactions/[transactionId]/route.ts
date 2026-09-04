import { eq, getTableColumns, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cardCategories, creditCategories, transactions } from '@/db/schema';
import { isInflowAmount } from '@/lib/amounts';
import { db } from '@/lib/db';
import { errorResponse, pgErrorCode } from '@/lib/errors';

function badRequest(message: string) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 });
}

// Every column EXCEPT the raw Plaid payload, the same exclusion GET
// /api/transactions makes and for the same reason (see the note there):
// plaid_transaction is one to two kilobytes of transactions/sync JSON per row
// that no client reads. A bare `.returning()` shipped it back on EVERY category
// pick — the one column the list endpoint went out of its way to strip — and
// the account page merges the response straight into its row
// (`{ ...baseline, ...data.transaction }`), so it also parked that payload in
// component state for the life of the page. Excluded rather than enumerated, so
// a column added to the schema still reaches the client without a change here.
const { plaidTransaction: _plaidTransaction, ...returnedColumns } = getTableColumns(transactions);

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

function isValidId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 2147483647;
}

// Set a transaction's category. Exactly one key must be present:
// - { cardCategoryId: number }   spend category (positive amounts)
// - { creditCategoryId: number } inflow category (negative amounts)
// Each key writes only its own kind's columns; the DB sign constraint keeps a
// row from ever holding the other kind.
//
// There is no clear (decided 2026-09-04). A categorization is never retracted,
// only replaced: null was accepted here once, and the card-kind clear also
// destroyed the recorded reward_rate, which is the one thing every other
// writer goes out of its way to keep. The picker's "none" placeholder is
// disabled for the same rule, and this is the server half of it — no caller
// can clear a category or a rate, whatever the UI offers.
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
      return badRequest(`${key} must be a positive integer`);
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

      // `for share`, not a plain read: the transaction row's own lock makes
      // the read-validate-write atomic against other writers of that row, but
      // the card this write is validated against lives on the accounts row,
      // and a seed re-match can rewrite accounts.card_id between an unlocked
      // read here and the commit. Read without a lock under READ COMMITTED,
      // this could validate a category against a card_id the account no
      // longer holds.
      //
      // `share` rather than `update`: this only has to stop the row changing
      // underneath, not claim it. Cheap in practice — the seed writes accounts
      // rows only when a match actually changes, so nothing is held here on an
      // ordinary run — and when it does contend, the lock_timeout above turns
      // the wait into the retryable 503 rather than a stall. Lock ORDER is
      // transactions-then-accounts here; neither the seed nor the sync locks
      // an accounts row while holding a transactions row, so this adds no
      // cycle.
      //
      // Taken for BOTH kinds. For the card kind the value is validated against
      // it; for the credit kind it is the supported-account rule (see the top
      // of src/app/accounts/[accountId]/page.tsx), which is stated as an
      // absolute — "there is no such thing as categorizing a transaction on an
      // account with no card" — and an invariant the writer does not enforce
      // is one the next client can break. Reading the row the same way for
      // both is one less difference for a later reader to account for.
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.accountId, transaction.accountId))
        .for('share');
      // An account with no matched card is unsupported, so the UI offers no
      // picker for it at all. Reaching here means a client went around that,
      // so refuse rather than invent a card.
      if (!account?.cardId) {
        throw new RejectedRequest(badRequest('This account has no matched card definition'));
      }

      let updateSet: { cardCategoryId: number; rewardRate: string } | { creditCategoryId: number };
      let cardCategoryName: string | null = null;
      let creditCategoryName: string | null = null;

      if (hasCardKey) {
        if (isInflow) {
          throw new RejectedRequest(
            badRequest('Negative-amount transactions take a credit category, not a card category'),
          );
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
        // Retired, not deleted, when it left the seed file (src/db/schema.ts):
        // the row is still here so old transactions keep their link, but it is
        // no longer one of the card's categories and must not take new picks.
        // The picker never offers it (GET /api/cards filters retired rows), so
        // this is the server half of the same rule.
        if (category.retiredAt !== null) {
          throw new RejectedRequest(
            badRequest('That category is no longer offered for this card — reload and pick again'),
          );
        }
        updateSet = { cardCategoryId: category.id, rewardRate: category.rate };
        cardCategoryName = category.name;
      } else {
        if (!isInflow) {
          throw new RejectedRequest(
            badRequest('Positive-amount transactions take a card category, not a credit category'),
          );
        }
        const [category] = await tx
          .select()
          .from(creditCategories)
          .where(eq(creditCategories.id, categoryId));
        if (!category) {
          throw new RejectedRequest(badRequest('creditCategoryId does not exist'));
        }
        if (category.retiredAt !== null) {
          throw new RejectedRequest(
            badRequest('That category is no longer offered — reload and pick again'),
          );
        }
        updateSet = { creditCategoryId: category.id };
        creditCategoryName = category.name;
      }

      const [updated] = await tx
        .update(transactions)
        .set({ ...updateSet, updatedAt: sql`now()` })
        .where(eq(transactions.transactionId, transactionId))
        .returning(returnedColumns);

      // The other kind's name needs no lookup: the sign constraint means a row
      // never holds both kinds, so the kind this request did not write is null
      // on the updated row.
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
    // 40P01 deadlock_detected: this handler locks the transactions row FOR
    // UPDATE and then needs FOR KEY SHARE on the category row for the FK check
    // on its update, while the seed's backfill (scripts/seed-cards.ts) locks
    // transactions rows while reading card_categories, and a sync's upsert
    // loop locks transactions rows in Plaid's order. Postgres breaks a cycle
    // by aborting one side, and it gets there before the 3s lock_timeout
    // above, since deadlock_timeout defaults to 1s. Retrying is right: the
    // run that caused it is short-lived.
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
    // then stopped existing before the update landed. The seed no longer
    // deletes category rows (it retires them — src/db/schema.ts), so only a
    // delete made by hand can open this window now; it is kept mapped because
    // the update writes nothing but the two category columns, so the code
    // cannot mean any other FK, and the honest answer is still "reload" rather
    // than a 500. Retrying will not bring the category back.
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
