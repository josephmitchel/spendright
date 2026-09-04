---
name: whole-sync-single-transaction
description: Running account upserts, transaction upserts and the cursor update inside one database transaction
tags: [syncItem, upsertAccount, db.transaction]
date: 2026-09-04
---

One bad account rolled back the whole sync including the cursor, wedging the item, and held the category-wipe locks for the length of the sync. Account upserts now commit each in their own transaction before the transactions transaction opens.
