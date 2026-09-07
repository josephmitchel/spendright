// Design: config-validated-not-assumed.

// pg accepts a missing/wrong-scheme connectionString (Verified-on: pg@8.23.0),
// so a bad DATABASE_URL must fail here.
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
