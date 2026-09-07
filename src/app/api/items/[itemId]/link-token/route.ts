import { type NextRequest, NextResponse } from 'next/server';
import type { LinkTokenResponse } from '@/lib/api-types';
import { withErrorResponse } from '@/lib/errors';
import { createRepairLinkToken } from '@/lib/link';

// Design: single-user-localhost-no-auth, connection-repair-update-mode.
export const POST = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { itemId } = await params;
    const linkToken = await createRepairLinkToken(itemId);
    return NextResponse.json<LinkTokenResponse>({ link_token: linkToken });
  },
);
