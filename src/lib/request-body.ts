import type { NextRequest } from 'next/server';
import { PublicError } from '@/lib/public-error';

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PublicError('Request body must be valid JSON', { status: 400, code: 'BAD_REQUEST' });
  }
}
