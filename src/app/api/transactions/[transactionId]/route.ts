import { eq, getTableColumns, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cardCategories, creditCategories, transactions } from '@/db/schema';
import { isInflowAmount } from '@/lib/amounts';
import { db } from '@/lib/db';
import { badRequest, errorResponse, jsonError, pgErrorCode } from '@/lib/errors';

// Every column except the raw Plaid payload. Design: raw-plaid-payload-stored-not-served.
const { plaidTransaction: _plaidTransaction, ...returnedColumns } = getTableColumns(transactions);

// A rejection decided inside the db transaction. Thrown so the transaction
// rolls back (db.transaction commits on return); caught below and returned.
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
// - { cardCategoryId: number }   spend category (amount >= 0)
// - { creditCategoryId: number } inflow category (amount < 0)
// There is no clear. Design: category-write-contract, no-category-clear.
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

    // Row locked for the whole read-validate-write: a concurrent sync can flip
    // the amount's sign or delete the row. The lock wait is bounded so a long
    // sync or seed run yields a retryable 503 instead of pinning a connection.
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`);
      const [transaction] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, transactionId))
        .for('update');
      if (!transaction) {
        throw new RejectedRequest(jsonError('NOT_FOUND', 'Transaction not found', 404));
      }
      const isInflow = isInflowAmount(transaction.amount);

      // `for share` so a seed re-match cannot rewrite accounts.card_id between
      // this read and the commit. Lock order is transactions-then-accounts.
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.accountId, transaction.accountId))
        .for('share');
      // Design: supported-account-rule.
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
        // Retired categories keep old links but take no new picks.
        // Design: categories-retired-not-deleted.
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

      // The other kind's name is null: the sign constraint means a row never
      // holds both kinds.
      return NextResponse.json({
        transaction: { ...updated, cardCategoryName, creditCategoryName },
      });
    });
  } catch (err) {
    if (err instanceof RejectedRequest) return err.response;
    const code = pgErrorCode(err);
    // 55P03 lock_not_available (lock_timeout expired) and 40P01
    // deadlock_detected (against the seed backfill or a sync upsert): both
    // are retryable.
    if (code === '55P03' || code === '40P01') {
      return jsonError(
        'LOCKED',
        'This transaction is being synced right now — try again in a moment',
        503,
      );
    }
    // 23503 foreign_key_violation: the category was deleted (by hand; the seed
    // only retires) between validation and the update.
    if (code === '23503') {
      return jsonError(
        'CATEGORY_REMOVED',
        'That category no longer exists — reload the page and pick again',
        409,
      );
    }
    return errorResponse(err);
  }
}
