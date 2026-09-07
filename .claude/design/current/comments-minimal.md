---
name: comments-minimal
description: Code comments are minimal — Design/Verified-on markers, one-line orientation, and short local constraints only; no rationale essays or authoritative cross-module claims. Purpose is derived from the code first, the design records second
tags: [Design markers, Verified-on, scripts/check-design-refs.mjs, comments]
date: 2026-09-06
---

Decided by the user 2026-09-06 after a quality audit found the prose surface (~1,180 comment lines) rivaling the code, with authoritative claims that had already drifted from the code in several verified places. Agents must derive the purpose of code primarily from what the code actually does, and secondarily from this design folder.

A comment is allowed to be: a `Design: <record-name>` marker (name-checked by lint), a `Verified-on: <package>@<version>` marker plus the one-line claim it covers, a one-sentence orientation line for a file or component, or a 1–2 line local constraint the code cannot show (lock ordering, a wire-format fact, why a check is shaped oddly). Not allowed: multi-sentence rationale essays, restatements of record content, authoritative cross-module claims ("the only X", "can never", "single source of truth"), and audit/history narration — that context belongs in these records.
