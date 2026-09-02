// Upserts src/db/cards.seed.ts into Postgres and re-matches accounts to cards.
// Run with: npm run seed:cards

import { config } from 'dotenv';
config({ path: '.env.local' });

import { and, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cardSeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, transactions } from '../src/db/schema';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    let categoryCount = 0;

    for (const seed of cardSeeds) {
      const cardValues = {
        slug: seed.slug,
        name: seed.name,
        issuer: seed.issuer ?? null,
        type: seed.type,
        plaidAccountNames: seed.plaidAccountNames,
      };
      const [card] = await db
        .insert(cards)
        .values(cardValues)
        .onConflictDoUpdate({
          target: cards.slug,
          set: { ...cardValues, updatedAt: sql`now()` },
        })
        .returning();

      for (const category of seed.categories) {
        const categoryValues = {
          cardId: card.id,
          name: category.name,
          rate: String(category.rate),
        };
        await db
          .insert(cardCategories)
          .values(categoryValues)
          .onConflictDoUpdate({
            target: [cardCategories.cardId, cardCategories.name],
            set: { rate: categoryValues.rate, updatedAt: sql`now()` },
          });
        categoryCount++;
      }

      const seedNames = seed.categories.map((c) => c.name);
      const removed = await db
        .delete(cardCategories)
        .where(
          and(eq(cardCategories.cardId, card.id), notInArray(cardCategories.name, seedNames)),
        )
        .returning({ name: cardCategories.name });
      if (removed.length > 0) {
        console.log(
          `  ${seed.slug}: removed categories no longer in seed: ${removed.map((r) => r.name).join(', ')}`,
        );
      }
    }

    // Remove cards that are no longer in the seed file. Their categories
    // cascade-delete, which set-nulls transactions.card_category_id; the
    // orphaned-rate cleanup below clears the leftover rates.
    const seedSlugs = cardSeeds.map((s) => s.slug);
    const zombies =
      seedSlugs.length > 0
        ? await db.delete(cards).where(notInArray(cards.slug, seedSlugs)).returning({ slug: cards.slug })
        : await db.delete(cards).returning({ slug: cards.slug });
    if (zombies.length > 0) {
      console.log(`  removed cards no longer in seed: ${zombies.map((z) => z.slug).join(', ')}`);
    }

    // Propagate rate changes to transactions that reference a category
    await db.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is distinct from cc.rate
    `);

    // Re-match every account to a card by Plaid account name. When an account
    // moves off a card it was previously matched to, its transactions'
    // selections belong to the old card — wipe them back to none.
    const cardList = await db.select().from(cards);
    const accountList = await db.select().from(accounts);
    let matched = 0;
    for (const account of accountList) {
      const normalized = account.name?.trim().toLowerCase();
      const card =
        cardList.find((c) =>
          (c.plaidAccountNames ?? []).some((n) => n.trim().toLowerCase() === normalized),
        ) ?? null;
      if (card) matched++;
      if ((card?.id ?? null) !== account.cardId) {
        if (account.cardId !== null) {
          const wiped = await db
            .update(transactions)
            .set({ cardCategoryId: null, rewardRate: null, updatedAt: sql`now()` })
            .where(eq(transactions.accountId, account.accountId))
            .returning({ id: transactions.id });
          console.log(
            `  account "${account.name}" changed card: wiped categories on ${wiped.length} transaction(s)`,
          );
        }
        await db
          .update(accounts)
          .set({ cardId: card?.id ?? null, updatedAt: sql`now()` })
          .where(eq(accounts.id, account.id));
        console.log(`  account "${account.name}" -> ${card ? card.slug : 'no card'}`);
      }
    }

    // Clear rates left behind wherever a category link was severed
    // (deleted/renamed categories, removed cards).
    const orphans = await db
      .update(transactions)
      .set({ rewardRate: null, updatedAt: sql`now()` })
      .where(and(isNull(transactions.cardCategoryId), isNotNull(transactions.rewardRate)))
      .returning({ id: transactions.id });
    if (orphans.length > 0) {
      console.log(`  cleared orphaned reward_rate on ${orphans.length} transaction(s)`);
    }

    console.log(
      `Seeded ${cardSeeds.length} card(s), ${categoryCount} categories. ` +
        `${matched}/${accountList.length} account(s) matched to a card.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
