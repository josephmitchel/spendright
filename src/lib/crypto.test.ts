import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decrypt, encrypt } from '@/lib/crypto';
import { PublicError } from '@/lib/public-error';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

const savedKey = process.env.ENCRYPTION_KEY;
const savedPrevious = process.env.ENCRYPTION_KEY_PREVIOUS;

function setEnv(key: string | undefined, previous: string | undefined) {
  if (key === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = key;
  if (previous === undefined) delete process.env.ENCRYPTION_KEY_PREVIOUS;
  else process.env.ENCRYPTION_KEY_PREVIOUS = previous;
}

function expectBadConfig(fn: () => unknown, messagePart: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(PublicError);
    expect((err as PublicError).code).toBe('BAD_CONFIG');
    expect((err as PublicError).message).toContain(messagePart);
    return;
  }
  expect.unreachable('expected a PublicError');
}

beforeEach(() => {
  setEnv(KEY_A, undefined);
  // decrypt's terminal failure logs; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  setEnv(savedKey, savedPrevious);
  vi.restoreAllMocks();
});

describe('encrypt/decrypt', () => {
  it('round-trips through the iv:tag:ciphertext form', () => {
    const stored = encrypt('access-token-123');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(decrypt(stored)).toBe('access-token-123');
  });

  it('uses a fresh IV per call, so equal plaintexts encrypt differently', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects a malformed ENCRYPTION_KEY before touching data', () => {
    setEnv('too-short', undefined);
    expectBadConfig(() => encrypt('x'), 'ENCRYPTION_KEY must be 64 hex characters');
  });
});

describe('key rotation', () => {
  it('falls back to ENCRYPTION_KEY_PREVIOUS during the rotation window', () => {
    const stored = encrypt('rotate-me');
    setEnv(KEY_B, KEY_A);
    expect(decrypt(stored)).toBe('rotate-me');
  });

  it('fails with guidance when neither key matches', () => {
    const stored = encrypt('lost');
    setEnv(KEY_B, undefined);
    expectBadConfig(() => decrypt(stored), 'Could not decrypt a stored value');
  });

  it('rejects a malformed ENCRYPTION_KEY_PREVIOUS', () => {
    const stored = encrypt('x');
    setEnv(KEY_A, 'nonsense');
    expectBadConfig(() => decrypt(stored), 'ENCRYPTION_KEY_PREVIOUS must be 64 hex characters');
  });
});

describe('stored-value validation', () => {
  it('rejects values not in the iv:tag:ciphertext form this app writes', () => {
    expectBadConfig(() => decrypt('hand-edited'), 'iv:tag:ciphertext');
  });

  it('rejects a tampered auth tag as undecryptable', () => {
    const stored = encrypt('tamper-me');
    const [iv = '', tag = '', data = ''] = stored.split(':');
    const flipped = tag.startsWith('0') ? `1${tag.slice(1)}` : `0${tag.slice(1)}`;
    expectBadConfig(() => decrypt(`${iv}:${flipped}:${data}`), 'Could not decrypt a stored value');
  });
});
