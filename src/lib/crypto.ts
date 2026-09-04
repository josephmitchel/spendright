import crypto from 'crypto';
import { PublicError } from '@/lib/errors';

// 64 hex characters = the 32 bytes AES-256 requires.
const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

// Validated rather than asserted with `!` (decided 2026-09-03). Every failure
// mode of the old one-liner reached the user as an opaque 500 from
// errorResponse, for what is a one-line mistake in .env.local:
//
//   unset            Buffer.from(undefined, 'hex') throws a TypeError.
//   bad hex          Buffer.from does NOT throw — it stops at the first
//                    invalid character and returns a SHORT buffer, so a key
//                    with a stray space or a pasted "0x" prefix silently
//                    becomes a few bytes and createCipheriv fails with
//                    "Invalid key length" somewhere else entirely.
//   wrong length     same, one step later.
//
// scripts/seed-cards.ts guards DATABASE_URL for exactly this reason — fail
// before the damage, with a message naming the variable. This is the same check
// for the key that every stored Plaid access token depends on. PublicError so
// the message survives errorResponse's suppression (src/lib/errors.ts); it
// names the variable and the required shape, never the value.
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

// The stored form encrypt() writes above: three hex fields, iv:tag:ciphertext.
const CIPHERTEXT_PATTERN = /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]*$/;

// Guarded on the same principle as getKey (added 2026-09-04). getKey catches a
// key that is malformed; these are the two failures it cannot see, and both
// reached the user as an opaque 500 — or "Sync failed — check the server log"
// on EVERY item at once — with nothing anywhere naming ENCRYPTION_KEY:
//
//   wrong shape    a stored value not in iv:tag:ciphertext form leaves the
//                  destructured parts undefined, and Buffer.from(undefined,
//                  'hex') throws a bare TypeError.
//   rotated key    a well-formed key that is not the key the value was
//                  encrypted with passes getKey and fails several lines later
//                  in decipher.final() with "unable to authenticate data" —
//                  GCM authentication working exactly as designed.
//
// The rotated key is the case worth naming: it is silent until every
// institution stops syncing at the same moment, which reads as the app being
// broken rather than misconfigured. Both are BAD_CONFIG — nothing the app does
// at runtime produces either, and both are fixed in .env.local.
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
    // getKey's own PublicError passes through untouched: it names the problem
    // more precisely than anything this catch could say.
    if (err instanceof PublicError) throw err;
    // Logged, never echoed — the message below is written, not derived from
    // err.message (see PublicError in src/lib/errors.ts).
    console.error('decrypt failed:', err);
    throw new PublicError(
      'Could not decrypt a stored value — ENCRYPTION_KEY is not the key it was encrypted with. Rotating it invalidates every stored Plaid access token: restore the previous key, or remove the affected institutions and link them again',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
}
