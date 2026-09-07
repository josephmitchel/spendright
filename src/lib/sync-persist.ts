import { getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { Transaction as PlaidTransaction } from 'plaid';
import { accounts, transactions } from '@/db/schema';
import { categoryKindKeys, kindForAmount, type CategoryKind } from '@/lib/category-kinds';
import type { DbTransaction } from '@/lib/db';
import { logError } from '@/lib/log';
import { carriedColumns, type CarriedSelection } from '@/lib/sync-carry';

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
    // Design: plaid-category-reserved.
    category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
    pending: txn.pending ?? null,
    plaidTransaction: txn,
  };
}

// Must mirror the transactions.account_id FK exactly: keyed on account_id
// alone, read from the DB. Design: bounded-cursor-hold.
export async function knownAccountIdsFor(
  tx: DbTransaction,
  batch: PlaidTransaction[],
): Promise<Set<string>> {
  const batchAccountIds = [...new Set(batch.map((txn) => txn.account_id))];
  if (batchAccountIds.length === 0) return new Set();
  const rows = await tx
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(inArray(accounts.accountId, batchAccountIds));
  return new Set(rows.map((row) => row.accountId));
}

// Keeps each INSERT under Postgres's 65,535 bind-parameter cap.
const UPSERT_CHUNK_SIZE = 500;

const SKIPPED_ROW_LOG_CAP = 20;

type TransactionUpsertValues = ReturnType<typeof toTransactionRow> &
  Partial<
    Pick<typeof transactions.$inferInsert, 'cardCategoryId' | 'rewardRate' | 'creditCategoryId'>
  >;

const excluded = (column: { name: string }): SQL => sql`excluded.${sql.identifier(column.name)}`;

type BaseRowKey = keyof ReturnType<typeof toTransactionRow>;
const transactionColumns = getTableColumns(transactions);
const excludedBaseColumns = {
  transactionId: excluded(transactionColumns.transactionId),
  accountId: excluded(transactionColumns.accountId),
  itemId: excluded(transactionColumns.itemId),
  date: excluded(transactionColumns.date),
  name: excluded(transactionColumns.name),
  merchantName: excluded(transactionColumns.merchantName),
  amount: excluded(transactionColumns.amount),
  isoCurrencyCode: excluded(transactionColumns.isoCurrencyCode),
  category: excluded(transactionColumns.category),
  pending: excluded(transactionColumns.pending),
  plaidTransaction: excluded(transactionColumns.plaidTransaction),
} satisfies Record<BaseRowKey, SQL>;

// Design: category-kind-sign-rule.
function conflictSetForKind(kind: CategoryKind): PgUpdateSetSource<typeof transactions> {
  const set: PgUpdateSetSource<typeof transactions> = {
    ...excludedBaseColumns,
    updatedAt: sql`now()`,
  };
  for (const otherKind of Object.keys(categoryKindKeys) as CategoryKind[]) {
    if (otherKind === kind) continue;
    for (const column of categoryKindKeys[otherKind].writeColumns) set[column] = null;
  }
  return set;
}

function batchRows(
  itemId: string,
  upserts: PlaidTransaction[],
  knownAccountIds: Set<string>,
  carried: Map<string, CarriedSelection>,
): {
  rowsById: Map<string, { values: TransactionUpsertValues; kind: CategoryKind }>;
  skipped: number;
} {
  let skipped = 0;
  // Deduped last-wins: Postgres rejects one statement updating the same row twice.
  const rowsById = new Map<string, { values: TransactionUpsertValues; kind: CategoryKind }>();
  for (const txn of upserts) {
    if (!knownAccountIds.has(txn.account_id)) {
      skipped++;
      if (skipped <= SKIPPED_ROW_LOG_CAP) {
        logError(
          `sync ${itemId}: transaction ${txn.transaction_id} references unknown account ${txn.account_id} — skipped`,
        );
      } else if (skipped === SKIPPED_ROW_LOG_CAP + 1) {
        logError(`sync ${itemId}: further skipped rows elided — see the batch summary line`);
      }
      continue;
    }
    const row = toTransactionRow(txn, itemId);
    const carry = txn.pending_transaction_id ? carried.get(txn.pending_transaction_id) : undefined;
    const kind = kindForAmount(row.amount);
    const carriedValues = carriedColumns(carry, kind);
    rowsById.set(row.transactionId, {
      values: carriedValues ? { ...row, ...carriedValues } : row,
      kind,
    });
  }
  return { rowsById, skipped };
}

// The transaction holds locks category PATCHes compete for, so its duration
// must stay bounded by statement count. Design: bounded-cursor-hold.
export async function upsertTransactions(
  tx: DbTransaction,
  itemId: string,
  upserts: PlaidTransaction[],
  knownAccountIds: Set<string>,
  carried: Map<string, CarriedSelection>,
): Promise<number> {
  const { rowsById, skipped } = batchRows(itemId, upserts, knownAccountIds, carried);

  // A field a row omits renders as DEFAULT (Verified-on: drizzle-orm@0.45.2).
  // Design: pending-to-posted-carry.
  const groups: Record<CategoryKind, TransactionUpsertValues[]> = { card: [], credit: [] };
  for (const { values, kind } of rowsById.values()) groups[kind].push(values);
  for (const kind of Object.keys(groups) as CategoryKind[]) {
    const rows = groups[kind];
    if (rows.length === 0) continue;
    const set = conflictSetForKind(kind);
    for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
      await tx
        .insert(transactions)
        .values(rows.slice(start, start + UPSERT_CHUNK_SIZE))
        .onConflictDoUpdate({ target: transactions.transactionId, set });
    }
  }
  return skipped;
}
