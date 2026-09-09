import packageJson from '../../package.json';

// next's own floor is only >=20.9.0 (Verified-on: next@16.3.4), so a mismatched
// Node major would otherwise run silently; .npmrc's engine-strict only guards
// `npm install`, not runtime. package.json "engines" is the single source.
const SUPPORTED_NODE_MAJOR = Number.parseInt(packageJson.engines.node, 10);

export function assertSupportedNode(): void {
  if (Number.isNaN(SUPPORTED_NODE_MAJOR)) {
    throw new Error(
      `package.json engines.node ("${packageJson.engines.node}") must start with a major version`,
    );
  }
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== SUPPORTED_NODE_MAJOR) {
    throw new Error(
      `Node ${process.versions.node} is running — SpendRight supports Node ` +
        `${SUPPORTED_NODE_MAJOR}.x (package.json engines); switch versions (e.g. nvm use) ` +
        'and restart',
    );
  }
}

// pg accepts a missing/wrong-scheme connectionString (Verified-on: pg@8.23.0),
// so a bad DATABASE_URL must fail here.
const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\//;

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]', '']);
const TLS_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !DATABASE_URL_PATTERN.test(url)) {
    throw new Error(
      'DATABASE_URL must be a postgresql:// connection URL — set it in .env.local (or .env)',
    );
  }
  // Off-host connections must not carry tokens and financial data in cleartext.
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    // The scheme matched; leave other malformed shapes to pg's own parsing.
  }
  if (parsed) {
    const loopback =
      LOOPBACK_HOSTS.has(parsed.hostname) || /^127(\.\d{1,3}){3}$/.test(parsed.hostname);
    const sslmode = parsed.searchParams.get('sslmode');
    if (!loopback && (sslmode === null || !TLS_SSLMODES.has(sslmode))) {
      throw new Error(
        'DATABASE_URL points at a non-local host without TLS — append sslmode=require ' +
          '(or verify-ca / verify-full)',
      );
    }
  }
  return url;
}
