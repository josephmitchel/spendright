// Shared environment guards. Dependency-free (no next/server, no db) so
// drizzle.config.ts and scripts can import it without pulling in a pool or
// framework code. Design: config-validated-not-assumed.

// pg treats a missing connectionString as "use PG* env vars and libpq
// defaults", not an error, and parses a wrong-scheme URL scheme-agnostically
// rather than rejecting it — so an unset or malformed DATABASE_URL must fail
// here, never quietly connect to whatever is listening on localhost. The
// `postgres://` alias passes too: the intent is rejecting non-Postgres
// schemes, not one spelling. Never logs the value.
const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\//;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !DATABASE_URL_PATTERN.test(url)) {
    throw new Error(
      'DATABASE_URL must be a postgresql:// connection URL — set it in .env.local (or .env)',
    );
  }
  return url;
}
