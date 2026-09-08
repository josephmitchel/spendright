---
name: data-at-rest-encryption
description: What is and isn't encrypted at rest — Plaid access tokens are AES-256-GCM encrypted under ENCRYPTION_KEY (never served by any route) with a two-key rotation path (ENCRYPTION_KEY_PREVIOUS fallback + rotate:key script); financial data (balances, amounts, merchants, raw payloads) is deliberately cleartext at the single-user/localhost stage
tags:
  [
    src/lib/crypto.ts,
    encrypt,
    decrypt,
    items.access_token,
    GET /api/items,
    ENCRYPTION_KEY_PREVIOUS,
    getPreviousKey,
    scripts/rotate-encryption-key.ts,
    rotate:key,
    src/db/schema.ts,
    plaidTransaction,
    accessToken,
    "encryption at rest",
  ]
date: 2026-09-04
---

## Access tokens encrypted (decided 2026-09-04)

Tokens are stored as `iv:tag:ciphertext` hex. `GET /api/items` strips the column via `publicItemColumns` in `src/lib/items.ts` — the single definition of the served item columns, from which the served type is derived ([[typed-api-contract]], 2026-09-06). A link encrypts the token exactly once: `storeItemShell` returns the ciphertext it wrote and `storeItem` re-writes it verbatim ([[link-flow]]). Rotating the key invalidates every stored token unless the rotation path below is used; the decrypt path names that condition explicitly (see [[config-validated-not-assumed]]).

## Encryption-key rotation (confirmed 2026-09-07)

The 2026-09-07 security audit found no rotation path for `ENCRYPTION_KEY` — the ciphertext format carries no key ID, so a suspected compromise forced either restoring the old key or re-linking every institution, a blast radius that grows with each linked item, and no record showed that tradeoff was accepted. Rather than versioning the stored format (a migration plus a second field for one key's worth of history), `decrypt` (src/lib/crypto.ts) now tries `ENCRYPTION_KEY` then, if set, `ENCRYPTION_KEY_PREVIOUS` (validated to the same 64-hex shape; [[config-validated-not-assumed]]). The rotation procedure: move the old key to `ENCRYPTION_KEY_PREVIOUS`, set the fresh `ENCRYPTION_KEY`, run `npm run rotate:key` (scripts/rotate-encryption-key.ts, which re-encrypts every `items.access_token` under the current key using its own bounded pool like the seed script), then unset the previous key. Since 2026-09-07 (the compatibility audit found the script's per-row updates racing a live server's link/relink writes — a lost update could revert a row to an invalidated token) each update lands only where the ciphertext still equals what was read (`where item_id = … and access_token = <read value>`); a row that changed mid-rotation was re-written by the live server under the *current* key, so the script logs it and leaves it alone. The script reports rotated-vs-total counts, an interrupted run keeps decrypting via the fallback, and rerunning is safe. `encrypt` always writes under the current key, so the fallback window is only as long as the operator leaves it open. The npm script passes `--conditions=react-server` so importing the server-only crypto module works under tsx. The access-token rule above still holds; [[item-delete-plaid-first]]'s unreadable-token exception remains the escape hatch when both keys are lost.

## Financial data plaintext at rest (confirmed 2026-09-07)

Successive security audits flagged that only `items.accessToken` is encrypted (above) while balances, transaction amounts, merchant names, and the raw Plaid payload (`transactions.plaidTransaction`) are cleartext — and, more to the point, that no record said whether that was a decision. It is: the user accepted plaintext-at-rest for this stage.

Rationale: the deployment boundary is a single user's local machine with a local Postgres ([[single-user-localhost-no-auth]], [[deployment-boundaries]]); the realistic threat there is device compromise, which full-disk encryption addresses better than column encryption. Encrypting the financial columns would break SQL over amounts (ordering, aggregation, the category-kind sign rule's DB constraint) for no boundary-relevant gain. The access token stays encrypted because it is a credential — it can move money-adjacent state at Plaid, not just read local rows.

Revisit trigger: any remote/hosted database, backups leaving the machine, or a multi-user posture — at that point per-column or disk-level encryption of the financial data becomes a real decision, not a default.
