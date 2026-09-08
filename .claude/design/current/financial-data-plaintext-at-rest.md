---
name: financial-data-plaintext-at-rest
description: Financial data (balances, amounts, merchant names, raw Plaid payloads) is deliberately stored in cleartext at the single-user/localhost stage — only the Plaid access token is encrypted; revisit before any remote deployment or multi-user posture
tags: [src/db/schema.ts, plaidTransaction, accessToken, encrypt, src/lib/crypto.ts, "encryption at rest"]
date: 2026-09-07
---

Confirmed 2026-09-07: successive security audits flagged that only `items.accessToken` is encrypted ([[access-tokens-encrypted]]) while balances, transaction amounts, merchant names, and the raw Plaid payload (`transactions.plaidTransaction`) are cleartext — and, more to the point, that no record said whether that was a decision. It is: the user accepted plaintext-at-rest for this stage.

Rationale: the deployment boundary is a single user's local machine with a local Postgres ([[single-user-localhost-no-auth]], [[deployment-boundaries]]); the realistic threat there is device compromise, which full-disk encryption addresses better than column encryption. Encrypting the financial columns would break SQL over amounts (ordering, aggregation, the category-kind sign rule's DB constraint) for no boundary-relevant gain. The access token stays encrypted because it is a credential — it can move money-adjacent state at Plaid, not just read local rows.

Revisit trigger: any remote/hosted database, backups leaving the machine, or a multi-user posture — at that point per-column or disk-level encryption of the financial data becomes a real decision, not a default.
