import { describe, expect, it } from 'vitest';
import { isPlaidItemError, plaidErrorBody, plaidErrorMessage } from '@/lib/plaid-errors';

describe('isPlaidItemError', () => {
  it('treats { message } bodies as app-internal notices', () => {
    expect(isPlaidItemError({ message: 'sync skipped' })).toBe(false);
  });

  it('treats Plaid-shaped bodies as repairable Plaid errors', () => {
    expect(isPlaidItemError({ error_code: 'ITEM_LOGIN_REQUIRED' })).toBe(true);
  });
});

describe('plaidErrorBody', () => {
  const axiosLike = (data: unknown) => ({ response: { data } });

  it('returns null when there is no response body', () => {
    expect(plaidErrorBody(new Error('boom'))).toBeNull();
    expect(plaidErrorBody(undefined)).toBeNull();
    expect(plaidErrorBody(axiosLike(undefined))).toBeNull();
  });

  it('returns null without a non-empty string error_code', () => {
    expect(plaidErrorBody(axiosLike({ error_message: 'no code' }))).toBeNull();
    expect(plaidErrorBody(axiosLike({ error_code: '' }))).toBeNull();
    expect(plaidErrorBody(axiosLike({ error_code: 42 }))).toBeNull();
  });

  it('picks only the allow-listed fields', () => {
    const body = plaidErrorBody(
      axiosLike({
        error_type: 'ITEM_ERROR',
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'the user must log in',
        display_message: 'Please reconnect your bank',
        request_id: 'req-1',
        access_token: 'secret-should-not-pass',
      }),
    );
    expect(body).toEqual({
      error_type: 'ITEM_ERROR',
      error_code: 'ITEM_LOGIN_REQUIRED',
      error_message: 'the user must log in',
      display_message: 'Please reconnect your bank',
      request_id: 'req-1',
    });
  });

  it('drops non-string field values instead of passing them through', () => {
    const body = plaidErrorBody(
      axiosLike({ error_code: 'X', error_message: { nested: true }, request_id: 7 }),
    );
    expect(body?.error_message).toBeUndefined();
    expect(body?.request_id).toBeUndefined();
  });

  it('preserves an explicit null display_message', () => {
    const body = plaidErrorBody(axiosLike({ error_code: 'X', display_message: null }));
    expect(body?.display_message).toBeNull();
  });
});

describe('plaidErrorMessage', () => {
  it('prefers display_message, then error_message, then the fallback', () => {
    expect(plaidErrorMessage({ display_message: 'shown', error_message: 'raw' }, 'fb')).toBe(
      'shown',
    );
    expect(plaidErrorMessage({ display_message: null, error_message: 'raw' }, 'fb')).toBe('raw');
    expect(plaidErrorMessage({}, 'fb')).toBe('fb');
  });

  it('skips empty strings and non-string values', () => {
    expect(plaidErrorMessage({ display_message: '', error_message: 'raw' }, 'fb')).toBe('raw');
    expect(
      plaidErrorMessage({ display_message: 1 as unknown as string, error_message: '' }, 'fb'),
    ).toBe('fb');
  });
});
