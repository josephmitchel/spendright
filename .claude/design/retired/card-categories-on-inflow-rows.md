---
name: card-categories-on-inflow-rows
description: Card categories assignable to negative-amount rows, with only a mutual-exclusion constraint between the two category kinds
tags: [transactions_one_category_kind_ck, drizzle/0003_abnormal_dakota_north.sql, isInflowAmount]
date: 2026-09-04
---

Migration 0003 replaced the mutual-exclusion check with the sign constraint and backfilled the wrong-kind state. Card categories on inflow rows, or credit categories on spend rows, must not come back.
