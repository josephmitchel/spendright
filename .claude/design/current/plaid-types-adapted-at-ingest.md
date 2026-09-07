---
name: plaid-types-adapted-at-ingest
description: Plaid SDK types stop at src/lib/plaid.ts — every endpoint wrapper returns an app-owned Provider* shape from src/lib/provider-types.ts, so domain code never imports from 'plaid'
tags:
  [
    src/lib/provider-types.ts,
    src/lib/plaid.ts,
    ProviderAccount,
    ProviderTransaction,
    ProviderSyncBatch,
    ProviderItem,
    RawProviderPayload,
    toProviderTransaction,
    toProviderAccount,
    toProviderItem,
  ]
date: 2026-09-07
---

Decided 2026-09-07 (user-confirmed, after an OWASP/ISO audit found SDK types used as the working domain model): `src/lib/plaid.ts` adapts every response to an app-owned type before returning — `getAccounts` → `ProviderAccount[]`, `getItem` → `ProviderItem`, `syncTransactions` → `ProviderSyncBatch` of `ProviderTransaction`s. The shapes live in `src/lib/provider-types.ts`, a dependency-free module ([[client-server-boundary-enforced]]) so `src/db/schema.ts` (loaded by drizzle-kit and scripts outside Next) can reach them without touching the server-only Plaid root. Fields are camelCase and null-normalized at the boundary; the `personal_finance_category` → `category` fallback happens in the adapter ([[plaid-category-reserved]]). This is a thin ingest seam, not a multi-provider abstraction — no second provider is planned.

Deliberately still Plaid-shaped: the raw payload stored per transaction row, typed as the opaque `RawProviderPayload` ([[raw-plaid-payload-stored-not-served]]); the `cards.plaid_account_names` column and matching rule ([[account-card-matching-by-name]]); the hand-mirrored error shape in `src/lib/plaid-errors.ts` ([[plaid-error-log-redaction]]); and the endpoint set itself, which is Plaid's.
