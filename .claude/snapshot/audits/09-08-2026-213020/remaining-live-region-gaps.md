---
characteristics: [interaction-capability]
level: moderate
status: new
first-seen: 09-08-2026-213020
locations:
  - src/app/accounts/[accountId]/page.tsx:181
  - src/app/accounts/[accountId]/page.tsx:79
---

# Two dynamic notices still render outside the project's live-region convention

The fix for `missing-live-region-for-outcome-states` covered the five outcome messages it cited, but two auditors independently found spots the fix didn't touch, each breaking the same SNAPSHOT convention ("errors render conditionally with `role="alert"`; status text lives inside always-mounted `role="status"` wrappers; new async UI must follow this"):

- **Stale-categories notice** (`src/app/accounts/[accountId]/page.tsx:181-185`): the conditionally-rendered "Category lists may be out of date — editing is off until they refresh." paragraph carries no live-region role — the one remaining state-driven notice in the client UI without one. `categoriesMayBeStale` can flip to true at any time when a 60s background poll fails, at which point both `CategorySelect` pickers silently go disabled and this explanation pops into the DOM unannounced. A screen-reader user mid-edit gets no signal that their pickers stopped working or why — exactly the failure mode the convention exists to prevent. This is the driver of the moderate level.
- **Pager range** (`src/app/accounts/[accountId]/page.tsx:79-89`): the "Showing {rangeStart}–{rangeEnd} of {total}" text sits in a plain `<p>`; only the transient "Loading…" span has `role="status"`. On a page turn a screen-reader user hears "Loading…" and then silence — the outcome (the new range) is never announced.

Suggested direction: give the stale notice `role="status"` inside an always-mounted wrapper of its own (it's a benign state change, not a failure) so both transitions (fresh→stale and stale→fresh) announce, and move the pager's `role="status"` wrapper up to cover the range line (or add a second always-mounted status span containing it), matching the pattern already applied to every sibling notice.
