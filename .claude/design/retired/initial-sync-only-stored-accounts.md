---
name: initial-sync-only-stored-accounts
description: Handing the initial sync only the accounts that stored successfully in the link route
tags: [src/app/api/exchange/route.ts, syncItem, plaidAccounts]
date: 2026-09-04
---

Filtering the list made every transaction for an unstored account a skip. The link route now hands syncItem every account Plaid reported, since syncItem retries each in its own transaction and a failure costs only that account.
