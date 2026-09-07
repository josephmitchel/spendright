// Postgres SQLSTATE recognition for errors thrown under a drizzle query.
// Dependency-free (no next/server import) so domain modules can branch on a
// code without touching the HTTP layer.

// drizzle wraps the pg error in a DrizzleQueryError and hangs it off `cause`
// (Verified-on: drizzle-orm@0.45.2), so the chain is walked. Node errno
// codes like EPIPE are also five [0-9A-Z] chars but no SQLSTATE class starts
// with E, so they are screened out.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const NODE_ERRNO = /^E[A-Z]+$/;

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current != null && typeof current === 'object' && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    // Shape-checked so a wrapper's own `code` cannot answer for the pg error.
    if (typeof code === 'string' && SQLSTATE.test(code) && !NODE_ERRNO.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
