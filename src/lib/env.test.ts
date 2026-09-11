import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSupportedNode, requireDatabaseUrl } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

const withUrl = (url: string) => {
  vi.stubEnv('DATABASE_URL', url);
  return requireDatabaseUrl();
};

describe('requireDatabaseUrl', () => {
  it('rejects a missing DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL must be a postgresql:\/\//);
  });

  it('rejects a non-postgres scheme', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://user:pw@localhost/db');
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL must be a postgresql:\/\//);
  });

  it.each([
    'postgresql://user:pw@localhost:5432/db',
    'postgres://user:pw@localhost/db',
    'postgresql://user:pw@127.0.0.1:5432/db',
    'postgresql://user:pw@127.1.2.3/db',
    'postgresql://user:pw@[::1]:5432/db',
  ])('allows the loopback URL %s without TLS', (url) => {
    expect(withUrl(url)).toBe(url);
  });

  it('rejects a non-loopback host without sslmode', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pw@db.example.com:5432/db');
    expect(() => requireDatabaseUrl()).toThrow(/without TLS.*sslmode=require/);
  });

  it('rejects 127-lookalike hosts that are not loopback', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pw@127.0.0.1.evil.com/db');
    expect(() => requireDatabaseUrl()).toThrow(/without TLS/);
  });

  it.each(['require', 'verify-ca', 'verify-full'])(
    'allows a remote host with sslmode=%s',
    (mode) => {
      const url = `postgresql://user:pw@db.example.com/db?sslmode=${mode}`;
      expect(withUrl(url)).toBe(url);
    },
  );

  it.each(['disable', 'prefer', 'allow'])('rejects a remote host with sslmode=%s', (mode) => {
    vi.stubEnv('DATABASE_URL', `postgresql://user:pw@db.example.com/db?sslmode=${mode}`);
    expect(() => requireDatabaseUrl()).toThrow(/without TLS/);
  });

  it('lets a postgres-schemed URL the URL parser rejects fall through to pg', () => {
    const url = 'postgresql://[/db';
    expect(withUrl(url)).toBe(url);
  });
});

describe('assertSupportedNode', () => {
  it('accepts the Node version the suite is running on', () => {
    expect(() => assertSupportedNode()).not.toThrow();
  });

  it('rejects a different Node major with an actionable message', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'versions');
    if (!original) throw new Error('process.versions descriptor missing');
    Object.defineProperty(process, 'versions', {
      value: { ...process.versions, node: '99.0.0' },
      configurable: true,
    });
    try {
      expect(() => assertSupportedNode()).toThrow(
        /Node 99\.0\.0 is running — SpendRight supports Node/,
      );
    } finally {
      Object.defineProperty(process, 'versions', original);
    }
  });
});
