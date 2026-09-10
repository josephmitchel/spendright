---
characteristics: [interaction-capability]
level: minor
status: new
first-seen: 09-08-2026-214636
locations:
  - src/app/accounts/[accountId]/TransactionTable.tsx:47
---

# Category-pick irreversibility warning reaches only hover and screen readers

`CategorySelect` communicates that a category pick is a one-way commitment
("Once set, a category can be changed but never cleared") exclusively through
the native `title` attribute (`TransactionTable.tsx:47`). The prior fix
(`category-pick-irreversibility-not-surfaced`, resolved) verified this reaches
mouse users (hover tooltip) and screen-reader users (title-as-description when
`aria-label` is present), but two interaction modes still get no warning at
all:

- Touch-only devices have no hover state — the tooltip never appears.
- Sighted keyboard-only users don't get `title` tooltips on focus in current
  Chrome/Firefox/Safari — only on mouse hover.

Both groups can make the irreversible pick with zero in-context warning, the
exact operation error the text exists to prevent for the other populations.

Suggested direction: add a persistent, always-visible textual cue near the
category column (e.g. in the "Category" column header cell or a one-line note
above the table) stating the one-way rule, keeping `title` as a supplementary
hover cue. Consistent with the app's plain-HTML approach — a text node, no
CSS/JS needed.
