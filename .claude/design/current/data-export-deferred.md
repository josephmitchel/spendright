---
name: data-export-deferred
description: No data export/backup endpoint exists yet by decision — raw SQL (pg_dump) is the interim extraction path for the single-operator stage; revisit when the data would be painful to lose or the operator stops being the developer
tags: ["data export", "data backup", src/app/api, transactions, "pg_dump extraction"]
date: 2026-09-07
---

Confirmed 2026-09-07: successive flexibility audits flagged the absence of any CSV/JSON export or dump path as a replaceability/lock-in gap — manually categorized transaction history ([[categorization-is-a-historical-snapshot]]) exists nowhere else once in Postgres — and noted it wasn't recorded as a decision. It now is: the user chose to defer building an export path.

Rationale: at this stage the operator is the developer ([[operator-is-developer]]) with direct database access, so `pg_dump` (or ad-hoc SQL) is a real, complete extraction path — an export endpoint would duplicate it for no current user. The data at risk is also still shallow (days of transactions, one card).

Revisit trigger: accumulated categorization history the user would mind losing, a second (non-developer) user, or any migration away from this Postgres — any of those makes a first-class export (JSON dump of accounts, transactions, and category assignments) worth building.
