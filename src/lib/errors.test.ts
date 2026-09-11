import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { badRequest, publicErrorMessage, withErrorResponse } from '@/lib/errors';
import { PublicError } from '@/lib/public-error';

// errorResponse/allowListedError are exercised through the exported surface:
// every route wraps its handler in withErrorResponse.
const respond = (err: unknown) =>
  withErrorResponse(async () => {
    throw err;
  })();

const plaidShaped = (fields: Record<string, unknown>) => ({
  response: { data: fields },
});

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withErrorResponse', () => {
  it('passes a successful response through untouched', async () => {
    const handler = withErrorResponse(async () => NextResponse.json({ ok: true }, { status: 201 }));
    const res = await handler();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('returns an expected PublicError as-is without logging', async () => {
    const res = await respond(
      new PublicError('Pick a real category', { status: 400, code: 'BAD_REQUEST' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Pick a real category' },
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('logs a 5xx PublicError but still serves its user-safe message', async () => {
    const res = await respond(
      new PublicError('Key material missing', { status: 500, code: 'BAD_CONFIG' }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: 'BAD_CONFIG', message: 'Key material missing' },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('maps a Plaid-shaped error to 502 with its display message', async () => {
    const res = await respond(
      plaidShaped({
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'the login has expired',
        display_message: 'Please reconnect your bank',
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: 'ITEM_LOGIN_REQUIRED', message: 'Please reconnect your bank' },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('falls back to error_message when display_message is null', async () => {
    const res = await respond(
      plaidShaped({
        error_code: 'RATE_LIMIT',
        error_message: 'too many requests',
        display_message: null,
      }),
    );
    expect((await res.json()).error.message).toBe('too many requests');
  });

  it.each(['55P03', '40P01'])(
    'maps pg %s (nested in cause) to a retryable 503 LOCKED',
    async (code) => {
      const res = await respond(Object.assign(new Error('query failed'), { cause: { code } }));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('LOCKED');
      expect(body.error.message).toMatch(/try again/);
    },
  );

  it('never echoes an unknown error message (drizzle messages carry SQL and params)', async () => {
    const res = await respond(
      new Error('update "items" set "access_token" = $1 -- params: ["secret-token-value"]'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal server error' } });
    expect(JSON.stringify(body)).not.toContain('secret-token-value');
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('does not mistake a Node errno for a pg SQLSTATE', async () => {
    const res = await respond(Object.assign(new Error('socket died'), { code: 'ECONNRESET' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL');
  });
});

describe('publicErrorMessage', () => {
  it('returns a PublicError message', () => {
    expect(publicErrorMessage(new PublicError('nope'), 'fallback')).toBe('nope');
  });

  it('returns a Plaid error message', () => {
    const err = plaidShaped({
      error_code: 'X',
      error_message: 'plaid says no',
      display_message: null,
    });
    expect(publicErrorMessage(err, 'fallback')).toBe('plaid says no');
  });

  it('returns the fallback for an unknown error without echoing it', () => {
    expect(publicErrorMessage(new Error('secret sql'), 'Sync failed')).toBe('Sync failed');
  });
});

describe('badRequest', () => {
  it('produces a 400 with the BAD_REQUEST code', async () => {
    const res = badRequest('missing field');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'missing field' } });
  });
});
