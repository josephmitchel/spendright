import crypto from 'crypto';
import type { JWKPublicKey } from 'plaid';
import { plaidErrorBody, PublicError } from '@/lib/errors';
import { loggableError } from '@/lib/log';
import { getWebhookVerificationKey } from '@/lib/plaid';

// Plaid signs every webhook with an ES256 JWT in the Plaid-Verification
// header whose payload names the body's sha256. It is verified here because
// /api/webhook is the one route that must be internet-reachable (through a
// tunnel), so unlike the rest of the app it cannot rely on localhost being
// the only caller. https://plaid.com/docs/api/webhooks/webhook-verification/
// Design: webhook-jwt-verification, single-user-localhost-no-auth.

const MAX_TOKEN_AGE_SECONDS = 5 * 60;

// Verification keys are cached per kid with a TTL, so a key Plaid marks
// expired stops verifying within the hour, not at the next process restart.
// A key Plaid has marked expired is refused: Plaid never signs with expired
// keys, so such a JWT was not signed by Plaid today. A kid Plaid definitely
// answered "no such key" for is cached negatively, so a repeated made-up kid
// costs at most one outbound Plaid call per five minutes; a fetch that fails
// any other way (network, 5xx, rate limit) proves nothing about the kid and
// is not cached. Negative caching alone cannot bound a spray of
// never-repeated kids (each is a miss by definition), so outbound key
// fetches are also budgeted per window. The budget bounds outbound calls,
// not verification: a genuine key whose TTL has lapsed still verifies (the
// authoritative expiry is jwk.expired_at, checked on every use), so a
// sustained spray that pins the budget at its cap degrades genuine webhooks
// to a slightly-stale key instead of 401ing them.
// Design: webhook-jwt-verification.
const KEY_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const FETCH_BUDGET_WINDOW_MS = 5 * 60 * 1000;
const MAX_FETCHES_PER_WINDOW = 10;
const keyCache = new Map<string, { jwk: JWKPublicKey | null; fetchedAt: number }>();
let fetchWindowStart = 0;
let fetchesInWindow = 0;

// When the size-capped cache is full, evict the stalest negative entry
// first, then the stalest TTL-expired key, and a fresh key only when every
// entry is one (never in practice: Plaid keys number far fewer than 50).
// Under a sustained kid-spray the map fills with fresh negatives while the
// genuine key — fetched once — carries the oldest fetchedAt, so evicting
// purely by staleness would flush the genuine key first; and a TTL-expired
// genuine key outranks every negative because it is the fallback that keeps
// verification alive while a spray holds the fetch budget at its cap.
function evictStalestEntry(): void {
  const now = Date.now();
  let evictKid: string | undefined;
  let evictRank = Infinity;
  let evictAt = Infinity;
  for (const [kid, entry] of keyCache) {
    const rank = !entry.jwk ? 0 : now - entry.fetchedAt >= KEY_TTL_MS ? 1 : 2;
    if (rank < evictRank || (rank === evictRank && entry.fetchedAt < evictAt)) {
      evictRank = rank;
      evictAt = entry.fetchedAt;
      evictKid = kid;
    }
  }
  if (evictKid !== undefined) keyCache.delete(evictKid);
}

// The specific reason is a server log line only; the response is a uniform
// 401 that tells a forger nothing about which check failed.
function reject(reason: string): never {
  console.error(`webhook verification failed: ${reason}`);
  throw new PublicError('Webhook verification failed', { status: 401, code: 'UNVERIFIED' });
}

function decodeSegment(segment: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    reject('a JWT segment is not base64url-encoded JSON');
  }
  // JSON.parse also produces null, numbers, and arrays; reading a claim off
  // null would throw past reject() and turn the uniform 401 into a 500.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('a JWT segment is not a JSON object');
  }
  return value as Record<string, unknown>;
}

// Plaid webhooks are a few KB; anything larger is not Plaid. Note that by the
// time any route code runs the body is already buffered — with src/proxy.ts
// present, Next buffers every request body up front, bounded only by the
// proxyClientMaxBodySize cap in next.config.ts. What this precheck saves is
// the UTF-8 decode and SHA-256, not the buffering.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

// The refusals that need no body bytes, run before the body is decoded or
// hashed so an anonymous caller cannot make the route do that work for free.
export function precheckPlaidWebhook(token: string | null, contentLength: string | null): void {
  if (!token) reject('the Plaid-Verification header is missing');
  if (contentLength !== null && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    reject('the declared body length exceeds the webhook size cap');
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

  const now = Date.now();
  const cached = keyCache.get(header.kid);
  // A TTL-stale key is still a genuine Plaid key — the TTL is a freshness
  // convenience, while jwk.expired_at (checked below) is the authoritative
  // expiry — so it is held as a fallback: a refresh failure or an exhausted
  // fetch budget degrades to the stale key instead of 401ing webhooks Plaid
  // genuinely signed.
  const staleJwk = cached?.jwk ?? null;
  let jwk: JWKPublicKey;
  if (cached && now - cached.fetchedAt < (cached.jwk ? KEY_TTL_MS : NEGATIVE_TTL_MS)) {
    // The kid is attacker-controlled: JSON.stringify keeps a newline in it
    // from forging a log line.
    if (!cached.jwk) reject(`no verification key for kid ${JSON.stringify(header.kid)} (cached)`);
    jwk = cached.jwk;
  } else {
    if (now - fetchWindowStart >= FETCH_BUDGET_WINDOW_MS) {
      fetchWindowStart = now;
      fetchesInWindow = 0;
    }
    if (fetchesInWindow >= MAX_FETCHES_PER_WINDOW) {
      if (!staleJwk) {
        reject(`key fetch budget exhausted; refusing kid ${JSON.stringify(header.kid)} unfetched`);
      }
      jwk = staleJwk;
    } else {
      fetchesInWindow += 1;
      if (keyCache.size >= MAX_CACHE_ENTRIES) evictStalestEntry();
      try {
        jwk = await getWebhookVerificationKey(header.kid);
        keyCache.set(header.kid, { jwk, fetchedAt: now });
      } catch (err) {
        console.error('webhook verification key fetch failed:', loggableError(err));
        // Only Plaid's own answer proves the kid does not exist: a Plaid
        // error body on a non-429 4xx. A network failure, 5xx, or rate
        // limit says nothing about the kid, and negatively caching one
        // would 401 genuine webhooks for five minutes over a blip.
        const status = (err as { response?: { status?: number } } | null)?.response?.status;
        if (plaidErrorBody(err) && status != null && status >= 400 && status < 500 && status !== 429) {
          keyCache.set(header.kid, { jwk: null, fetchedAt: now });
          reject(`no verification key for kid ${JSON.stringify(header.kid)}`);
        }
        if (!staleJwk) {
          reject(`key fetch failed for kid ${JSON.stringify(header.kid)} with no cached key`);
        }
        jwk = staleJwk;
      }
    }
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
