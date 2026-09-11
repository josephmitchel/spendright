'use client';

import type { ApiCard, ApiCreditCategory, ApiTransaction } from '@/lib/api-types';
import type { CardType } from '@/lib/card-types';
import {
  assertNeverKind,
  categoryKindKeys,
  kindForAmount,
  type CategoryKind,
} from '@/lib/category-kinds';
import { formatMoney, rowCurrency } from '@/lib/money';

// A new CardType must name its rate unit here or fail to compile.
const RATE_HEADERS = { cashback: 'Cashback %', points: 'Multiplier' } satisfies Record<
  CardType,
  string
>;

// The staleness notice the page renders whenever the pickers are unavailable;
// referenced from each unavailable select so the reason is not sighted-only.
export const CATEGORY_STALE_NOTICE_ID = 'category-stale-notice';

function CategorySelect({
  value,
  valueName,
  options,
  onSelect,
  unavailable,
  ariaLabel,
}: {
  value: number | null;
  valueName: string | null;
  options: { id: number; name: string }[];
  onSelect: (id: number) => void;
  // aria-disabled, never disabled: a background poll can flip this while the
  // select holds focus, and disabling it would eject focus to <body>.
  unavailable?: boolean;
  // The row context a screen reader can't get from the column header alone.
  ariaLabel: string;
}) {
  const stale = value !== null && !options.some((option) => option.id === value);
  return (
    <select
      style={{ maxWidth: '100%', ...(unavailable ? { opacity: 0.5 } : undefined) }}
      value={value ?? ''}
      aria-disabled={unavailable || undefined}
      // With aria-label present, title is exposed as the description, so the
      // one-way warning reaches both hover and screen readers.
      title="Once set, a category can be changed but never cleared"
      aria-label={ariaLabel}
      aria-describedby={unavailable ? CATEGORY_STALE_NOTICE_ID : undefined}
      onChange={(e) => {
        if (unavailable) return;
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
      return txn.rewardRate ?? '—';
    default:
      return assertNeverKind(kind);
  }
}

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
  categoriesMayBeStale: boolean;
  patchErrors: ReadonlyMap<string, string>;
  // Never rejects; fired un-awaited.
  onSelectCategoryAction: (
    row: ApiTransaction,
    kind: CategoryKind,
    categoryId: number,
  ) => Promise<void>;
}) {
  const rateHeader = RATE_HEADERS[card.type];
  const optionsByKind = {
    card: card.categories,
    credit: creditCategories,
  } satisfies Record<CategoryKind, { id: number; name: string }[]>;
  return (
    <>
      <p>Once set, a category can be changed but never cleared.</p>
      {/* The wrapper scrolls on narrow viewports so the page body never does. */}
      <div style={{ overflowX: 'auto' }}>
        <table
          border={1}
          style={{
            tableLayout: 'fixed',
            width: '100%',
            minWidth: '640px',
            overflowWrap: 'break-word',
          }}
        >
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
                  <td>{txn.name ?? '—'}</td>
                  <td>{txn.merchantName ?? '—'}</td>
                  <td>{formatMoney(txn.amount, rowCurrency(txn))}</td>
                  <td>{rowCurrency(txn)}</td>
                  <td>
                    {options.length > 0 ? (
                      <CategorySelect
                        value={selectedId}
                        valueName={selectedName}
                        options={options}
                        onSelect={(id) => void onSelectCategoryAction(txn, kind, id)}
                        unavailable={categoriesMayBeStale}
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
      </div>
    </>
  );
}
