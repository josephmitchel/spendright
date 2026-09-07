---
name: dev-dependency-advisories-accepted
description: The 4 moderate npm-audit findings in the drizzle-kit → @esbuild-kit → esbuild chain (GHSA-67mh-4wv8-2f99) are accepted — dev-only, unreachable at runtime, and the only fix is a breaking drizzle-kit downgrade
tags: [npm audit, drizzle-kit, esbuild advisory chain, GHSA 67mh-4wv8-2f99, dev dependencies]
date: 2026-09-05
---

Accepted 2026-09-05 (raised by two security-audit passes, both recommending acceptance): `npm audit` reports 4 moderate findings, all one chain — `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild <= 0.24.2` (GHSA-67mh-4wv8-2f99, the esbuild dev-server CORS issue). It is dev tooling only: drizzle-kit never runs an esbuild dev server, and nothing in the chain is reachable from the app runtime (`npm audit --omit=dev` is clean). The only remediation npm offers is a breaking downgrade to `drizzle-kit@0.18.1`, which is worse than the exposure. Revisit when drizzle-kit drops the `@esbuild-kit` dependency; do not re-raise this chain in future audits while these facts hold.
