import crypto from 'crypto';
import { PublicError } from '@/lib/errors';

// 64 hex characters = the 32 bytes AES-256 requires.
const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

// Validated up front: Buffer.from(hex) silently returns a short buffer on bad
// hex. Design: config-validated-not-assumed. Names the variable, never the value.
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !ENCRYPTION_KEY_PATTERN.test(hex)) {
    throw new PublicError(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes) — generate one with `openssl rand -hex 32` and set it in .env.local',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// The stored form encrypt() writes: iv:tag:ciphertext, all hex.
const CIPHERTEXT_PATTERN = /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]*$/;

// A malformed stored value and a rotated key are both BAD_CONFIG, named as such
// rather than surfacing as an opaque 500.
export function decrypt(data: string): string {
  if (!CIPHERTEXT_PATTERN.test(data)) {
    throw new PublicError(
      'A stored encrypted value is not in the iv:tag:ciphertext form this app writes — the column was edited by hand, or written by something else',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  const [ivHex, authTagHex, encryptedHex] = data.split(':');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(Buffer.from(encryptedHex, 'hex')).toString() + decipher.final('utf8');
  } catch (err) {
    if (err instanceof PublicError) throw err;
    // GCM auth failure = wrong key. Logged, never echoed.
    console.error('decrypt failed:', err);
    throw new PublicError(
      'Could not decrypt a stored value — ENCRYPTION_KEY is not the key it was encrypted with. Rotating it invalidates every stored Plaid access token: restore the previous key, or remove the affected institutions and link them again',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
}
