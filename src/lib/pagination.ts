export const PAGE_SIZE = 20;

export const MAX_PAGE_LIMIT = 1000;

// Absent, zero, and non-numeric values take the fallback; an empty ?accountId=
// style guard is the caller's job.
export function readBound(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(raw));
  if (Number.isNaN(parsed) || parsed === 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
