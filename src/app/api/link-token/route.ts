import { NextResponse } from 'next/server';
import type { LinkTokenResponse } from '@/lib/api-types';
import { withErrorResponse } from '@/lib/errors';
import { createLinkToken } from '@/lib/plaid';

export const POST = withErrorResponse(async () => {
  const linkToken = await createLinkToken();
  return NextResponse.json<LinkTokenResponse>({ link_token: linkToken });
});
