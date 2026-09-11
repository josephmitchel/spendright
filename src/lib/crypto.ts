import 'server-only';

import crypto from 'crypto';
import { logError } from '@/lib/log';
import { PublicError } from '@/lib/public-error';

const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !ENCRYPTION_KEY_PATTERN.test(hex)) {
    throw new PublicError(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes) — generate one with ' +
        '`openssl rand -hex 32` and set it in .env.local',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return Buffer.from(hex, 'hex');
}

function getPreviousKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (!hex) return null;
  if (!ENCRYPTION_KEY_PATTERN.test(hex)) {
    throw new PublicError(
      'ENCRYPTION_KEY_PREVIOUS must be 64 hex characters (32 bytes), or unset',
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

const CIPHERTEXT_PATTERN = /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]*$/;

export function decrypt(data: string): string {
  if (!CIPHERTEXT_PATTERN.test(data)) {
    throw new PublicError(
      'A stored encrypted value is not in the iv:tag:ciphertext form this app writes — ' +
        'the column was edited by hand, or written by something else',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  const [ivHex = '', authTagHex = '', encryptedHex = ''] = data.split(':');
  // Previous-key fallback covers the window between a rotation and
  // `npm run rotate:key`.
  const keys = [getKey(), getPreviousKey()].filter((key): key is Buffer => key !== null);
  let lastError: unknown;
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      return decipher.update(Buffer.from(encryptedHex, 'hex')).toString() + decipher.final('utf8');
    } catch (err) {
      if (err instanceof PublicError) throw err;
      lastError = err;
    }
  }
  logError('decrypt failed:', lastError);
  throw new PublicError(
    'Could not decrypt a stored value — neither ENCRYPTION_KEY nor ENCRYPTION_KEY_PREVIOUS ' +
      'is the key it was encrypted with. Restore the right key (after a rotation, run ' +
      '`npm run rotate:key`), or remove the affected institutions and link them again',
    { status: 500, code: 'BAD_CONFIG' },
  );
}
