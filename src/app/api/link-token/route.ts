import { NextResponse } from 'next/server';
import type { LinkTokenResponse } from '@/lib/api-types';
import { errorResponse } from '@/lib/errors';
import { createLinkToken } from '@/lib/plaid';

export async function POST() {
  try {
    const linkToken = await createLinkToken();
    return NextResponse.json<LinkTokenResponse>({ link_token: linkToken });
  } catch (err) {
    return errorResponse(err);
  }
}
