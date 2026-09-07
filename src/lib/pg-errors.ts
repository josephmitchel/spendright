// drizzle hangs the pg error off `cause` (Verified-on: drizzle-orm@0.45.2);
// Node errno codes also match [0-9A-Z]{5} but no SQLSTATE class starts with E.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const NODE_ERRNO = /^E[A-Z]+$/;

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current != null && typeof current === 'object' && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && SQLSTATE.test(code) && !NODE_ERRNO.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
