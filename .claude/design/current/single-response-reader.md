---
name: single-response-reader
description: Every client read of an API response goes through readJson in src/lib/http.ts
tags: [readJson, src/lib/http.ts, HomeClient, PlaidLinkButton, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

`readJson` parses behind the ok check, surfaces the API's error message or a caller-phrased fallback, and treats a null or unparseable body as unreadable. It only works as a rule if it is the only way bodies are read; a component parsing a response by hand is a violation.
