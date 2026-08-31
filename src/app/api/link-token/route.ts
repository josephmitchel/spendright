import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createLinkToken } from '@/lib/plaid';

export async function POST() {
  try {
    const linkToken = await createLinkToken();
    return NextResponse.json({ link_token: linkToken });
  } catch (err) {
    return errorResponse(err);
  }
}
