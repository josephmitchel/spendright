import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';
import { base64ImageMime } from '@/lib/image-mime';

// The logo only changes on link/relink, so the browser may cache it for a day.
// Design: item-logo-served-separately, thin-routes-domain-in-lib.
export const GET = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { itemId } = await params;
    const [row] = await db
      .select({ logo: items.institutionLogo })
      .from(items)
      .where(eq(items.itemId, itemId));
    const mime = row?.logo ? base64ImageMime(row.logo) : null;
    if (!row?.logo || !mime) {
      return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return new NextResponse(Buffer.from(row.logo, 'base64'), {
      headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400' },
    });
  },
);
