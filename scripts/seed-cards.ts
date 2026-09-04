// Upserts src/db/cards.seed.ts into Postgres and re-matches accounts to cards.
// Run with: npm run seed:cards

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cardSeeds, creditCategorySeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, creditCategories } from '../src/db/schema';
import { matchCard } from '../src/lib/cards';

// Design: seed-validation. A blank matcher would match a whitespace-only Plaid
// account name, since matchCard normalizes both sides the same way.
function assertUniqueAccountMatchers() {
  const owners = new Map<string, string>();
  for (const seed of cardSeeds) {
    for (const name of seed.plaidAccountNames) {
      const key = name.trim().toLowerCase();
      if (!key) {
        throw new Error(`cards.seed.ts: "${seed.slug}" lists a blank plaidAccountNames entry`);
      }
      const owner = owners.get(key);
      if (owner) {
        throw new Error(
          `cards.seed.ts: plaidAccountNames entry "${name}" is claimed by both "${owner}" and "${seed.slug}"`,
        );
      }
      owners.set(key, seed.slug);
    }
  }
}

// Case-insensitive, stricter than the (card_id, name) unique index.
function assertUniqueCategoryNames() {
  for (const seed of cardSeeds) {
    const seen = new Set<string>();
    for (const category of seed.categories) {
      const key = category.name.trim().toLowerCase();
      if (seen.has(key)) {
        throw new Error(
          `cards.seed.ts: "${seed.slug}" lists the category "${category.name}" more than once`,
        );
      }
      seen.add(key);
    }
  }
}

function assertUniqueCreditCategoryNames() {
  const seen = new Set<string>();
  for (const name of creditCategorySeeds) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`cards.seed.ts: creditCategorySeeds lists "${name}" more than once`);
    }
    seen.add(key);
  }
}

async function main() {
  assertUniqueAccountMatchers();
  assertUniqueCategoryNames();
  assertUniqueCreditCategoryNames();

  // pg treats a missing connectionString as "use libpq defaults", not an error.
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — check .env.local (or .env) before running the seed');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rootDb = drizzle(pool);

  try {
    // Backfill missing reward rates only; existing rates are never restated
    // (design: categorization-is-a-historical-snapshot). Kept outside the
    // reconcile transaction so its transaction-row locks can't deadlock with a
    // concurrent sync. Idempotent.
    await rootDb.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is null
    `);

    // Reconcile the catalog to the seed file in one transaction. Rows that left
    // the file are retired, never deleted; nothing here touches `transactions`.
    // Design: seed-reconcile-is-destructive, categories-retired-not-deleted.
    await rootDb.transaction(async (tx) => {
      let categoryCount = 0;

      for (const seed of cardSeeds) {
        const cardValues = {
          slug: seed.slug,
          name: seed.name,
          issuer: seed.issuer ?? null,
          type: seed.type,
          plaidAccountNames: seed.plaidAccountNames,
        };
        // `retiredAt: null` revives a card whose slug came back into the file.
        const [card] = await tx
          .insert(cards)
          .values(cardValues)
          .onConflictDoUpdate({
            target: cards.slug,
            set: { ...cardValues, retiredAt: null, updatedAt: sql`now()` },
          })
          .returning();

        for (const category of seed.categories) {
          const categoryValues = {
            cardId: card.id,
            name: category.name,
            rate: String(category.rate),
          };
          await tx
            .insert(cardCategories)
            .values(categoryValues)
            .onConflictDoUpdate({
              target: [cardCategories.cardId, cardCategories.name],
              set: { rate: categoryValues.rate, retiredAt: null, updatedAt: sql`now()` },
            });
          categoryCount++;
        }

        // Empty seed list = retire every category (drizzle can't render
        // notInArray([])). `retired_at is null` keeps the original stamp.
        const seedNames = seed.categories.map((c) => c.name);
        const retired = await tx
          .update(cardCategories)
          .set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
          .where(
            and(
              eq(cardCategories.cardId, card.id),
              isNull(cardCategories.retiredAt),
              seedNames.length > 0 ? notInArray(cardCategories.name, seedNames) : undefined,
            ),
          )
          .returning({ name: cardCategories.name });
        if (retired.length > 0) {
          console.log(
            `  ${seed.slug}: retired categories no longer in seed: ${retired.map((r) => r.name).join(', ')}`,
          );
        }
      }

      // Credit categories: upsert by name (revives retired ones), then retire
      // the rest. drizzle throws on values([]).
      if (creditCategorySeeds.length > 0) {
        await tx
          .insert(creditCategories)
          .values(creditCategorySeeds.map((name) => ({ name })))
          .onConflictDoUpdate({
            target: creditCategories.name,
            set: { retiredAt: null, updatedAt: sql`now()` },
          });
      }
      const retiredCredit = await tx
        .update(creditCategories)
        .set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            isNull(creditCategories.retiredAt),
            creditCategorySeeds.length > 0
              ? notInArray(creditCategories.name, creditCategorySeeds)
              : undefined,
          ),
        )
        .returning({ name: creditCategories.name });
      if (retiredCredit.length > 0) {
        console.log(
          `  retired credit categories no longer in seed: ${retiredCredit.map((r) => r.name).join(', ')}`,
        );
      }

      // Retire cards no longer in the file; their categories are left as-is
      // since matchCard skips retired cards.
      const seedSlugs = cardSeeds.map((s) => s.slug);
      const retiredCards = await tx
        .update(cards)
        .set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            isNull(cards.retiredAt),
            seedSlugs.length > 0 ? notInArray(cards.slug, seedSlugs) : undefined,
          ),
        )
        .returning({ slug: cards.slug });
      if (retiredCards.length > 0) {
        console.log(
          `  retired cards no longer in seed: ${retiredCards.map((c) => c.slug).join(', ')}`,
        );
      }

      // Re-match accounts to cards by Plaid account name. Only accounts.card_id
      // is written; a null match never clears saved categories.
      const cardList = await tx.select().from(cards).orderBy(cards.id);
      const accountList = await tx.select().from(accounts);
      let matched = 0;
      for (const account of accountList) {
        const card = matchCard(cardList, account.name);
        if (card) matched++;
        if ((card?.id ?? null) !== account.cardId) {
          await tx
            .update(accounts)
            .set({ cardId: card?.id ?? null, updatedAt: sql`now()` })
            .where(eq(accounts.id, account.id));
          console.log(`  account "${account.name}" -> ${card ? card.slug : 'no card'}`);
        }
      }

      console.log(
        `Seeded ${cardSeeds.length} card(s), ${categoryCount} categories, ` +
          `${creditCategorySeeds.length} credit categories. ` +
          `${matched}/${accountList.length} account(s) matched to a card.`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
