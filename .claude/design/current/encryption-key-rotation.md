---
name: encryption-key-rotation
description: ENCRYPTION_KEY can be rotated without re-linking every institution — decrypt falls back to ENCRYPTION_KEY_PREVIOUS, and scripts/rotate-encryption-key.ts re-encrypts every stored access token under the current key
tags:
  [
    ENCRYPTION_KEY_PREVIOUS,
    getPreviousKey,
    scripts/rotate-encryption-key.ts,
    rotate:key,
    src/lib/crypto.ts,
    decrypt,
    encrypt,
    items.access_token,
  ]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 security audit found no rotation path for `ENCRYPTION_KEY` — the ciphertext format carries no key ID, so a suspected compromise forced either restoring the old key or re-linking every institution, a blast radius that grows with each linked item, and no record showed that tradeoff was accepted. Rather than versioning the stored format (a migration plus a second field for one key's worth of history), `decrypt` (src/lib/crypto.ts) now tries `ENCRYPTION_KEY` then, if set, `ENCRYPTION_KEY_PREVIOUS` (validated to the same 64-hex shape; [[config-validated-not-assumed]]). The rotation procedure: move the old key to `ENCRYPTION_KEY_PREVIOUS`, set the fresh `ENCRYPTION_KEY`, run `npm run rotate:key` (scripts/rotate-encryption-key.ts, which re-encrypts every `items.access_token` under the current key using its own bounded pool like the seed script), then unset the previous key. `encrypt` always writes under the current key, so the fallback window is only as long as the operator leaves it open. The npm script passes `--conditions=react-server` so importing the server-only crypto module works under tsx. [[access-tokens-encrypted]] still holds; [[item-delete-plaid-first]]'s unreadable-token exception remains the escape hatch when both keys are lost.
