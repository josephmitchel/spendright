---
characteristic: 'safety'
---

# Summary

All three auditors returned clean passes, and since the prior audit was also clean there was nothing to carry forward — each auditor instead independently re-derived the prior era's clean-pass claims against current source rather than trusting them. The safety-relevant surface held up everywhere inspected: fail-closed crypto with validated ciphertext shape and rotation fallback (`src/lib/crypto.ts`), the DB CHECK constraint exactly mirroring `kindForAmount`'s sign convention (`transactions_category_kind_sign_ck`), server-authoritative reward-rate resolution with row-locked re-validation of ownership/retirement/kind on every category write (`src/lib/categories.ts`), seed rate bounds with mandatory non-future `ratesVerified` attestation and retire-not-delete semantics, bounded waits throughout the sync engine, skip/drop accounting read under lock, crash-loop-guarded process supervision, destructive removal behind a scope-naming `confirm()`, and honest staleness surfacing (null renders as '—', never zero; the "(unlinked)" rate state is defensive, not a latent bug). No path was found by which stale, fabricated, or silently-wrong financial data could reach the user.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.

# Resolved since prior audit

Nothing to carry — the prior audit recorded zero findings, and this audit confirms the clean state holds.
