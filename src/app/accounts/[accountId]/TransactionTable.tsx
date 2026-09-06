'use client';

import type { ApiCard, ApiCreditCategory, ApiTransaction } from '@/lib/api-types';
import { isInflowAmount, type CategoryKind } from '@/lib/amounts';

// One picker for both category kinds. Placeholders are disabled+hidden: a
// transaction keeps a category once one is assigned (design: no-category-clear).
function CategorySelect({
  value,
  valueName,
  options,
  onSelect,
  disabled,
}: {
  value: number | null;
  valueName: string | null;
  options: { id: number; name: string }[];
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  // A saved category the list no longer offers (retired/renamed) still renders
  // as the current value, but is not selectable again.
  const stale = value !== null && !options.some((option) => option.id === value);
  return (
    <select
      // Fixed-width table column; without this the select overflows its cell.
      style={{ maxWidth: '100%' }}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => {
        if (!e.target.value) return;
        onSelect(Number(e.target.value));
      }}
    >
      <option value="" disabled hidden>
        none
      </option>
      {stale && (
        <option value={value} disabled hidden>
          {valueName ?? 'unavailable'}
        </option>
      )}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

// The transaction rows for a matched card, category pickers included.
// Design: supported-account-rule, category-kind-sign-rule.
export function TransactionTable({
  card,
  creditCategories,
  transactionList,
  categoriesMayBeStale,
  onSelectCategory,
}: {
  card: ApiCard;
  creditCategories: ApiCreditCategory[];
  transactionList: ApiTransaction[];
  // Design: stale-lists-disable-editing.
  categoriesMayBeStale: boolean;
  // Async so the type says what the handler is; the returned promise never
  // rejects (the patch hook folds failures into its own error state) and is
  // deliberately not awaited here.
  onSelectCategory: (row: ApiTransaction, kind: CategoryKind, categoryId: number) => Promise<void>;
}) {
  const rateHeader = card.type === 'points' ? 'Multiplier' : 'Cashback %';
  return (
    // Fixed layout so column widths don't shift between pages.
    <table border={1} style={{ tableLayout: 'fixed', width: '100%', overflowWrap: 'break-word' }}>
      <colgroup>
        <col style={{ width: '8%' }} />
        <col style={{ width: '25%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '7%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Name</th>
          <th>Merchant</th>
          <th>Amount</th>
          <th>Currency</th>
          <th>Category</th>
          <th>{rateHeader}</th>
          <th>Pending</th>
        </tr>
      </thead>
      <tbody>
        {transactionList.map((txn) => {
          // Inflow rows pick from credit categories, spend rows from the card's.
          const kind = isInflowAmount(txn.amount) ? 'credit' : 'card';
          const options = kind === 'credit' ? creditCategories : card.categories;
          const selectedId = kind === 'credit' ? txn.creditCategoryId : txn.cardCategoryId;
          const selectedName = kind === 'credit' ? txn.creditCategoryName : txn.cardCategoryName;
          return (
            <tr key={txn.transactionId}>
              <td>{txn.date}</td>
              <td>{txn.name}</td>
              <td>{txn.merchantName}</td>
              <td>{txn.amount}</td>
              <td>{txn.isoCurrencyCode}</td>
              <td>
                {options.length > 0 ? (
                  <CategorySelect
                    value={selectedId}
                    valueName={selectedName}
                    options={options}
                    onSelect={(id) => void onSelectCategory(txn, kind, id)}
                    disabled={categoriesMayBeStale}
                  />
                ) : (
                  (selectedName ?? 'none')
                )}
              </td>
              {/* A rate with no category link is legacy data; shown but marked. */}
              <td>
                {kind === 'credit'
                  ? '—'
                  : txn.rewardRate !== null && txn.cardCategoryId === null
                    ? `${txn.rewardRate} (unlinked)`
                    : txn.rewardRate}
              </td>
              <td>{txn.pending ? 'yes' : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
