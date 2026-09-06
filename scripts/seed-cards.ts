// Upserts src/db/cards.seed.ts into Postgres and re-matches accounts to cards.
// Run with: npm run seed:cards

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { and, eq, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { cardSeeds, creditCategorySeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, creditCategories } from '../src/db/schema';
import { matchCard } from '../src/lib/cards';
import { requireDatabaseUrl } from '../src/lib/env';

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

// Duplicate slugs would silently merge: the second upsert wins and the retire
// pass never flags either. Case-insensitive, stricter than the slug unique index.
function assertUniqueSlugs() {
  const seen = new Map<string, string>();
  for (const seed of cardSeeds) {
    const key = seed.slug.trim().toLowerCase();
    if (!key) {
      throw new Error(`cards.seed.ts: "${seed.name}" has a blank slug`);
    }
    const other = seen.get(key);
    if (other) {
      throw new Error(`cards.seed.ts: slug "${seed.slug}" is used by more than one card`);
    }
    seen.set(key, seed.slug);
  }
}

// The handle drizzle passes to a rootDb.transaction callback (this script's
// schemaless client, not src/lib/db's schema-typed one).
type SeedTransaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// The one implementation of "retire what left the seed file": stamps
// retired_at on every live row in scope whose key column is no longer among
// `keptKeys`, and logs what it retired. An empty kept list retires everything
// in scope, because drizzle can't render notInArray([]); `retired_at is null`
// keeps the original stamp on already-retired rows.
// Design: seed-reconcile-is-destructive, categories-retired-not-deleted.
async function retireMissing(
  tx: SeedTransaction,
  table: typeof cards | typeof cardCategories | typeof creditCategories,
  keyColumn: AnyPgColumn,
  keptKeys: string[],
  label: string,
  scope?: SQL,
): Promise<void> {
  const retired = await tx
    .update(table)
    .set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        isNull(table.retiredAt),
        scope,
        keptKeys.length > 0 ? notInArray(keyColumn, keptKeys) : undefined,
      ),
    )
    .returning({ key: keyColumn });
  if (retired.length > 0) {
    console.log(`  ${label}: ${retired.map((row) => row.key).join(', ')}`);
  }
}

async function main() {
  assertUniqueSlugs();
  assertUniqueAccountMatchers();
  assertUniqueCategoryNames();
  assertUniqueCreditCategoryNames();

  // Shared guard — the seed must never run against whatever is on localhost.
  // Design: config-validated-not-assumed.
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
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
        if (!card) throw new Error(`card upsert returned no row for ${seed.slug}`);

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

        await retireMissing(
          tx,
          cardCategories,
          cardCategories.name,
          seed.categories.map((c) => c.name),
          `${seed.slug}: retired categories no longer in seed`,
          eq(cardCategories.cardId, card.id),
        );
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
      await retireMissing(
        tx,
        creditCategories,
        creditCategories.name,
        creditCategorySeeds,
        'retired credit categories no longer in seed',
      );

      // Retire cards no longer in the file; their categories are left as-is
      // since matchCard skips retired cards.
      await retireMissing(
        tx,
        cards,
        cards.slug,
        cardSeeds.map((s) => s.slug),
        'retired cards no longer in seed',
      );

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
