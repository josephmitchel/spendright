---
name: card-type-decides-rate-unit
description: A card's type (cashback or points) decides how its category rates are read
tags: [cards.type, card_categories.rate, rateHeader, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

`cards.type` is `'cashback'` or `'points'`. For a cashback card a category rate is a percentage; for a points card it is a point multiplier. The account page's rate column header follows the current card's type. Rates carry no unit of their own.
