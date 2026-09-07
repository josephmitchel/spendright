// Shared environment guards. Dependency-free (no next/server, no db) so
// drizzle.config.ts and scripts can import it without pulling in a pool or
// framework code. Design: config-validated-not-assumed.

// pg treats a missing connectionString as "use PG* env vars and libpq
// defaults" and parses a wrong-scheme URL scheme-agnostically
// (Verified-on: pg@8.23.0), so a bad DATABASE_URL must fail here. The
// `postgres://` alias passes too. Never logs the value.
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
