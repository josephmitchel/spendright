'use client';

import type { ApiCard, ApiCreditCategory, ApiTransaction } from '@/lib/api-types';
import {
  assertNeverKind,
  categoryKindKeys,
  kindForAmount,
  type CategoryKind,
} from '@/lib/category-kinds';

// Design: no-category-clear.
function CategorySelect({
  value,
  valueName,
  options,
  onSelect,
  disabled,
  ariaLabel,
}: {
  value: number | null;
  valueName: string | null;
  options: { id: number; name: string }[];
  onSelect: (id: number) => void;
  disabled?: boolean;
  // The row context a screen reader can't get from the column header alone.
  ariaLabel: string;
}) {
  const stale = value !== null && !options.some((option) => option.id === value);
  return (
    <select
      style={{ maxWidth: '100%' }}
      value={value ?? ''}
      disabled={disabled}
      aria-label={ariaLabel}
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

function rateCellText(txn: ApiTransaction, kind: CategoryKind): string | null {
  switch (kind) {
    case 'credit':
      return '—';
    case 'card':
      if (txn.rewardRate !== null && txn.cardCategoryId === null) {
        return `${txn.rewardRate} (unlinked)`;
      }
      return txn.rewardRate;
    default:
      return assertNeverKind(kind);
  }
}

// Design: supported-account-rule, category-kind-sign-rule.
export function TransactionTable({
  card,
  creditCategories,
  transactionList,
  categoriesMayBeStale,
  patchErrors,
  // Action-suffixed per Next's client-component prop convention; a plain callback.
  onSelectCategoryAction,
}: {
  card: ApiCard;
  creditCategories: ApiCreditCategory[];
  transactionList: ApiTransaction[];
  // Design: stale-lists-disable-editing.
  categoriesMayBeStale: boolean;
  // Design: optimistic-category-writes.
  patchErrors: ReadonlyMap<string, string>;
  // Never rejects; fired un-awaited.
  onSelectCategoryAction: (
    row: ApiTransaction,
    kind: CategoryKind,
    categoryId: number,
  ) => Promise<void>;
}) {
  // Design: card-type-decides-rate-unit.
  const rateHeader = card.type === 'points' ? 'Multiplier' : 'Cashback %';
  const optionsByKind = {
    card: card.categories,
    credit: creditCategories,
  } satisfies Record<CategoryKind, { id: number; name: string }[]>;
  return (
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
          <th scope="col">Date</th>
          <th scope="col">Name</th>
          <th scope="col">Merchant</th>
          <th scope="col">Amount</th>
          <th scope="col">Currency</th>
          <th scope="col">Category</th>
          <th scope="col">{rateHeader}</th>
          <th scope="col">Pending</th>
        </tr>
      </thead>
      <tbody>
        {transactionList.map((txn) => {
          const kind = kindForAmount(txn.amount);
          const options = optionsByKind[kind];
          const selectedId = txn[categoryKindKeys[kind].id];
          const selectedName = txn[categoryKindKeys[kind].name];
          const patchError = patchErrors.get(txn.transactionId);
          return (
            <tr key={txn.transactionId}>
              <td>{txn.date}</td>
              <td>{txn.name}</td>
              <td>{txn.merchantName}</td>
              <td>{txn.amount}</td>
              <td>{txn.isoCurrencyCode ?? txn.unofficialCurrencyCode}</td>
              <td>
                {options.length > 0 ? (
                  <CategorySelect
                    value={selectedId}
                    valueName={selectedName}
                    options={options}
                    onSelect={(id) => void onSelectCategoryAction(txn, kind, id)}
                    disabled={categoriesMayBeStale}
                    ariaLabel={`Category for ${txn.name ?? txn.transactionId} on ${txn.date}`}
                  />
                ) : (
                  (selectedName ?? 'none')
                )}
                {patchError && <div role="alert">Update failed: {patchError}</div>}
              </td>
              <td>{rateCellText(txn, kind)}</td>
              <td>{txn.pending ? 'yes' : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
