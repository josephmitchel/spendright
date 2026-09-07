import { type NextRequest, NextResponse } from 'next/server';
import type { TransactionPatchPayload } from '@/lib/api-types';
import { setTransactionCategory } from '@/lib/categories';
import { categoryKindKeys, type CategoryKind } from '@/lib/category-kinds';
import { badRequest, withErrorResponse } from '@/lib/errors';
import { readJsonBody } from '@/lib/request-body';

// Postgres serial ids are int32; anything past that cannot exist.
const MAX_INT32 = 2147483647;

function isValidId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_INT32;
}

// The body's exactly-one-key contract. Design: category-write-contract,
// no-category-clear.
type ParsedCategoryPatch =
  { ok: true; kind: CategoryKind; categoryId: number } | { ok: false; message: string };

function parseCategoryPatch(body: unknown): ParsedCategoryPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  // Wire keys come from the kind→key mapping in src/lib/category-kinds.ts;
  // iterating it (rather than naming the two kinds) keeps a new kind's wire
  // key accepted, and its error message current, without touching this
  // parser. Design: category-kind-exhaustive.
  const kinds = Object.keys(categoryKindKeys) as CategoryKind[];
  const present = kinds.filter((kind) => categoryKindKeys[kind].id in record);
  const [kind] = present;
  if (kind === undefined || present.length > 1) {
    const wireKeys = kinds.map((k) => categoryKindKeys[k].id).join(' or ');
    return { ok: false, message: `Provide exactly one of ${wireKeys}` };
  }
  const key = categoryKindKeys[kind].id;
  const raw = record[key];
  if (!isValidId(raw)) {
    return { ok: false, message: `${key} must be a positive integer` };
  }
  return { ok: true, kind, categoryId: raw };
}

// Set a transaction's category. Exactly one key must be present:
// - { cardCategoryId: number }   spend category (amount >= 0)
// - { creditCategoryId: number } inflow category (amount < 0)
// There is no clear. Design: category-write-contract, no-category-clear.
export const PATCH = withErrorResponse(
  async (req: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) => {
    const { transactionId } = await params;
    const parsed = parseCategoryPatch(await readJsonBody(req));
    if (!parsed.ok) {
      return badRequest(parsed.message);
    }

    const transaction = await setTransactionCategory(transactionId, parsed.kind, parsed.categoryId);
    return NextResponse.json<TransactionPatchPayload>({ transaction });
  },
);
