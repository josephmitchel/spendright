// Body validation for PATCH /api/transactions/[transactionId] — a lib module
// (not the route file) so the fast suite can exercise the boundaries.
import { categoryKindKeys, type CategoryKind } from '@/lib/category-kinds';

// Postgres serial ids are int32.
const MAX_INT32 = 2147483647;

export function isValidId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_INT32;
}

export type ParsedCategoryPatch =
  { ok: true; kind: CategoryKind; categoryId: number } | { ok: false; message: string };

export function parseCategoryPatch(body: unknown): ParsedCategoryPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
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
