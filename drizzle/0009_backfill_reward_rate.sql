-- Hand-written data statement (like 0003): one-time backfill of reward_rate
-- for rows categorized before migration 0001 established that card_category_id
-- and reward_rate are always written together. Every current write path pairs
-- them, so this is unreachable on post-0001 data; it moved here from
-- scripts/seed-cards.ts, which re-ran it on every seed.
UPDATE transactions t
SET reward_rate = cc.rate
FROM card_categories cc
WHERE t.card_category_id = cc.id AND t.reward_rate IS NULL;
