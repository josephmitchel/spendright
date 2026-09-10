---
characteristics: [interaction-capability]
level: minor
status: new
first-seen: 09-08-2026-210043
locations:
  - src/app/accounts/[accountId]/TransactionTable.tsx:40
---

# Category pick irreversibility is not surfaced in the UI

Per the snapshot, "Once set, a category can never be cleared — only replaced; PATCH rejects null" — a deliberate data-model decision, not itself a finding. However, nothing in the UI communicates this constraint at the moment the user acts. `CategorySelect` renders a disabled/hidden `"none"` option, silently removing the only way to represent "no category" as soon as any real category is chosen, with no label, title, or helper text indicating the pick is a one-way commitment (replaceable, never clearable). By contrast the comparably consequential institution "Remove" action gets a `confirm()` prompt. This is a user-error-protection/self-descriptiveness gap: a user who mis-clicks a category has no in-context cue that they can't revert to "unset". Suggested direction: a one-line note near the picker (or a `title`/`aria-description` on the select) stating that a category, once set, can only be changed — not cleared — without touching the underlying (correctly blessed) data policy.
