import { NextResponse } from 'next/server';

interface PlaidErrorBody {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

export function errorResponse(err: unknown): NextResponse {
  console.error(err);

  const plaidError = (err as { response?: { data?: PlaidErrorBody } })?.response?.data;
  if (plaidError?.error_code) {
    return NextResponse.json(
      {
        error: {
          code: plaidError.error_code,
          message: plaidError.display_message || plaidError.error_message || 'Plaid error',
        },
      },
      { status: 502 },
    );
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 });
}
