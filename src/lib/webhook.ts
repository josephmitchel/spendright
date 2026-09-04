import crypto from 'crypto';
import type { JWKPublicKey } from 'plaid';
import { PublicError } from '@/lib/errors';
import { getWebhookVerificationKey } from '@/lib/plaid';

// Plaid signs every webhook with an ES256 JWT in the Plaid-Verification
// header whose payload names the body's sha256. It is verified here because
// /api/webhook is the one route that must be internet-reachable (through a
// tunnel), so unlike the rest of the app it cannot rely on localhost being
// the only caller. https://plaid.com/docs/api/webhooks/webhook-verification/
// Design: webhook-jwt-verification, single-user-localhost-no-auth.

const MAX_TOKEN_AGE_SECONDS = 5 * 60;

// Verification keys are long-lived, so each kid is fetched once and cached
// for the process. A key Plaid has marked expired is refused: Plaid never
// signs with expired keys, so such a JWT was not signed by Plaid today.
const keyCache = new Map<string, JWKPublicKey>();

// The specific reason is a server log line only; the response is a uniform
// 401 that tells a forger nothing about which check failed.
function reject(reason: string): never {
  console.error(`webhook verification failed: ${reason}`);
  throw new PublicError('Webhook verification failed', { status: 401, code: 'UNVERIFIED' });
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    reject('a JWT segment is not base64url-encoded JSON');
  }
}

// Throws a 401 PublicError unless `token` is a Plaid-signed JWT for exactly
// `rawBody`. rawBody must be the request's bytes as received, not re-serialized
// JSON, or the hash comparison is meaningless.
export async function verifyPlaidWebhook(rawBody: string, token: string | null): Promise<void> {
  if (!token) reject('the Plaid-Verification header is missing');
  const segments = token.split('.');
  if (segments.length !== 3) reject('the JWT does not have three segments');
  const [headerB64, payloadB64, signatureB64] = segments;

  const header = decodeSegment(headerB64) as { alg?: unknown; kid?: unknown };
  // alg is pinned rather than read: honoring the header's choice of algorithm
  // is the classic JWT confusion attack.
  if (header.alg !== 'ES256') reject('the JWT alg is not ES256');
  if (typeof header.kid !== 'string' || !header.kid) reject('the JWT kid is missing');

  let jwk = keyCache.get(header.kid);
  if (!jwk) {
    try {
      jwk = await getWebhookVerificationKey(header.kid);
    } catch (err) {
      // A made-up kid arrives as a Plaid error; that is a bad token, not a 502.
      console.error('webhook verification key fetch failed:', err);
      reject(`no verification key for kid ${header.kid}`);
    }
    keyCache.set(header.kid, jwk);
  }
  if (jwk.expired_at != null) reject('the JWT is signed with an expired key');

  let publicKey: crypto.KeyObject;
  try {
    // Only the EC point fields; the SDK's JWK type is not structurally a JsonWebKey.
    publicKey = crypto.createPublicKey({
      key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      format: 'jwk',
    });
  } catch {
    reject('the verification key is not a usable JWK');
  }
  const verified = crypto.verify(
    'sha256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    // JWTs carry the raw r||s signature, not DER.
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signatureB64, 'base64url'),
  );
  if (!verified) reject('the JWT signature does not verify');

  const payload = decodeSegment(payloadB64) as { iat?: unknown; request_body_sha256?: unknown };
  if (typeof payload.iat !== 'number') reject('the JWT iat claim is missing');
  if (Math.abs(Date.now() / 1000 - payload.iat) > MAX_TOKEN_AGE_SECONDS) {
    reject('the JWT is older than five minutes');
  }
  if (typeof payload.request_body_sha256 !== 'string') {
    reject('the JWT request_body_sha256 claim is missing');
  }
  const actual = Buffer.from(crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex'));
  const claimed = Buffer.from(payload.request_body_sha256.toLowerCase());
  if (claimed.length !== actual.length || !crypto.timingSafeEqual(claimed, actual)) {
    reject('the body hash does not match the signed hash');
  }
}
