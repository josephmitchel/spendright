import { describe, expect, it } from 'vitest';
import type { ApiTransaction } from '@/lib/api-types';
import { categoryFields } from './category-patch';
import { CategoryWriteState } from './category-write-state';

function txn(transactionId: string, over: Partial<ApiTransaction> = {}): ApiTransaction {
  return {
    transactionId,
    cardCategoryId: null,
    cardCategoryName: null,
    rewardRate: null,
    creditCategoryId: null,
    creditCategoryName: null,
    ...over,
  } as ApiTransaction;
}

const groceries = { cardCategoryId: 1, cardCategoryName: 'Groceries', rewardRate: '6' };
const transit = { cardCategoryId: 2, cardCategoryName: 'Transit', rewardRate: '3' };

describe('burst settlement', () => {
  it('settles a single successful patch to the committed server row', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    state.recordCommit('t1', txn('t1', groceries));
    expect(state.settleIfDone('t1')).toEqual(categoryFields(txn('t1', groceries)));
  });

  it('only settles when the last patch of a burst finishes, on the newest commit', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    state.joinBurst(txn('t1'));

    state.recordCommit('t1', txn('t1', groceries));
    expect(state.settleIfDone('t1')).toBeNull();

    state.recordCommit('t1', txn('t1', transit));
    expect(state.settleIfDone('t1')).toEqual(categoryFields(txn('t1', transit)));
  });

  it('settles a fully failed burst back to the pre-burst baseline', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1', groceries));
    expect(state.settleIfDone('t1')).toEqual(categoryFields(txn('t1', groceries)));
  });

  it('ignores settle calls for rows with no burst', () => {
    const state = new CategoryWriteState();
    expect(state.settleIfDone('unknown')).toBeNull();
  });
});

describe('fetched-row merging', () => {
  it('returns incoming untouched when nothing is held', () => {
    const state = new CategoryWriteState();
    const incoming = [txn('t1'), txn('t2')];
    expect(state.fetchedRowMerger()(incoming, [])).toBe(incoming);
  });

  it('keeps a held row’s on-screen category fields over a fetched row', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));

    const merge = state.fetchedRowMerger();
    const merged = merge([txn('t1'), txn('t2', transit)], [txn('t1', groceries)]);

    expect(merged[0]).toEqual(txn('t1', groceries));
    expect(merged[1]).toEqual(txn('t2', transit));
  });

  it('passes a held row through when it is not on screen', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    const merged = state.fetchedRowMerger()([txn('t1', transit)], []);
    expect(merged[0]).toEqual(txn('t1', transit));
  });
});

describe('hold lifecycle', () => {
  it('lets a hold outlive its burst by one load', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    state.recordCommit('t1', txn('t1', groceries));
    state.settleIfDone('t1');

    // A load whose response predates the burst's commit can still settle now.
    const merged = state.fetchedRowMerger()([txn('t1')], [txn('t1', groceries)]);
    expect(merged[0]).toEqual(txn('t1', groceries));

    state.releaseSettledHolds();
    const after = state.fetchedRowMerger()([txn('t1')], [txn('t1', groceries)]);
    expect(after[0]).toEqual(txn('t1'));
  });

  it('never releases a row with an active burst', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    state.releaseSettledHolds();
    const merged = state.fetchedRowMerger()([txn('t1')], [txn('t1', groceries)]);
    expect(merged[0]).toEqual(txn('t1', groceries));
  });

  it('keeps holding a row whose burst restarts before release', () => {
    const state = new CategoryWriteState();
    state.joinBurst(txn('t1'));
    state.settleIfDone('t1');
    state.joinBurst(txn('t1', groceries));

    state.releaseSettledHolds();
    const merged = state.fetchedRowMerger()([txn('t1')], [txn('t1', groceries)]);
    expect(merged[0]).toEqual(txn('t1', groceries));
  });
});
