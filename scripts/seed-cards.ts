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
import { loadCardCatalog } from '../src/lib/card-catalog';
import { matchCard, normalizeAccountName } from '../src/lib/cards';
import type { DrizzleTransaction } from '../src/lib/db';
import { requireDatabaseUrl } from '../src/lib/env';
import { logFatalAndExit } from '../src/lib/log';

// Keys go through normalizeAccountName (the same normalization matchCard
// uses); `owner` names the seed entry for error messages.
// Design: seed-validation.
function assertUniqueKeys(
  entries: Array<{ value: string; owner: string }>,
  describe: {
    blank: (owner: string) => string;
    duplicate: (value: string, firstOwner: string, owner: string) => string;
  },
): void {
  const owners = new Map<string, string>();
  for (const { value, owner } of entries) {
    const key = normalizeAccountName(value);
    if (!key) throw new Error(describe.blank(owner));
    const firstOwner = owners.get(key);
    if (firstOwner !== undefined) {
      throw new Error(describe.duplicate(value, firstOwner, owner));
    }
    owners.set(key, owner);
  }
}

function assertSeedIsValid(): void {
  // Duplicate slugs would silently merge: the second upsert wins and the
  // retire pass never flags either.
  assertUniqueKeys(
    cardSeeds.map((seed) => ({ value: seed.slug, owner: seed.name })),
    {
      blank: (owner) => `cards.seed.ts: "${owner}" has a blank slug`,
      duplicate: (value) => `cards.seed.ts: slug "${value}" is used by more than one card`,
    },
  );

  // A blank matcher would match a whitespace-only Plaid account name, since
  // matchCard normalizes both sides the same way.
  assertUniqueKeys(
    cardSeeds.flatMap((seed) =>
      seed.plaidAccountNames.map((name) => ({ value: name, owner: seed.slug })),
    ),
    {
      blank: (owner) => `cards.seed.ts: "${owner}" lists a blank plaidAccountNames entry`,
      duplicate: (value, firstOwner, owner) =>
        `cards.seed.ts: plaidAccountNames entry "${value}" is claimed by both "${firstOwner}" and "${owner}"`,
    },
  );

  // Per-card, and case-insensitive: stricter than the (card_id, name) unique index.
  for (const seed of cardSeeds) {
    assertUniqueKeys(
      seed.categories.map((category) => ({ value: category.name, owner: seed.slug })),
      {
        blank: (owner) => `cards.seed.ts: "${owner}" lists a blank category name`,
        duplicate: (value, _firstOwner, owner) =>
          `cards.seed.ts: "${owner}" lists the category "${value}" more than once`,
      },
    );
  }

  assertUniqueKeys(
    creditCategorySeeds.map((name) => ({ value: name, owner: 'creditCategorySeeds' })),
    {
      blank: () => 'cards.seed.ts: creditCategorySeeds lists a blank name',
      duplicate: (value) => `cards.seed.ts: creditCategorySeeds lists "${value}" more than once`,
    },
  );
}

// The handle drizzle passes to a rootDb.transaction callback (this script's
// schemaless client, not src/lib/db's schema-typed one).
type SeedTransaction = DrizzleTransaction<NodePgDatabase>;

// Each seed table paired with its key column, so retireMissing takes them
// together.
type SeedTable = typeof cards | typeof cardCategories | typeof creditCategories;
interface RetireTarget {
  table: SeedTable;
  keyColumn: AnyPgColumn;
}
const retireTargets = {
  cards: { table: cards, keyColumn: cards.slug },
  cardCategories: { table: cardCategories, keyColumn: cardCategories.name },
  creditCategories: { table: creditCategories, keyColumn: creditCategories.name },
} satisfies Record<string, RetireTarget>;

// Retires every live row in scope whose key left `keptKeys`. An empty kept
// list retires everything in scope: the clause is omitted, which `and()`
// treats the same as the `true` drizzle renders notInArray([]) into
// (Verified-on: drizzle-orm@0.45.2).
// Design: seed-reconcile-is-destructive, categories-retired-not-deleted.
async function retireMissing(
  tx: SeedTransaction,
  { table, keyColumn }: RetireTarget,
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

// Upserts each seeded card and its categories, then retires the per-card
// categories that left the file. Returns the category count for the summary.
async function upsertCards(tx: SeedTransaction): Promise<number> {
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
      retireTargets.cardCategories,
      seed.categories.map((c) => c.name),
      `${seed.slug}: retired categories no longer in seed`,
      eq(cardCategories.cardId, card.id),
    );
  }

  return categoryCount;
}

// Credit categories: upsert by name (revives retired ones), then retire the
// rest. drizzle throws on values([]) (Verified-on: drizzle-orm@0.45.2).
async function upsertCreditCategories(tx: SeedTransaction): Promise<void> {
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
    retireTargets.creditCategories,
    creditCategorySeeds,
    'retired credit categories no longer in seed',
  );
}

// Re-matches accounts to cards by Plaid account name. Only accounts.card_id
// is written; a null match never clears saved categories. Returns the match
// counts for the summary.
async function rematchAccounts(tx: SeedTransaction): Promise<{ matched: number; total: number }> {
  const cardList = await loadCardCatalog(tx);
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
  return { matched, total: accountList.length };
}

async function main() {
  assertSeedIsValid();

  // Its own pool rather than src/lib/db's singleton: the script must end()
  // it below so the process can exit. Design: config-validated-not-assumed.
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const rootDb = drizzle(pool);

  try {
    // Backfill missing reward rates only; existing rates are never restated
    // (design: categorization-is-a-historical-snapshot). Outside the
    // reconcile transaction so its row locks can't deadlock with a sync.
    await rootDb.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is null
    `);

    // Reconcile the catalog to the seed file in one transaction.
    // Design: seed-reconcile-is-destructive, categories-retired-not-deleted.
    await rootDb.transaction(async (tx) => {
      const categoryCount = await upsertCards(tx);
      await upsertCreditCategories(tx);

      // Retire cards no longer in the file; their categories are left as-is
      // since matchCard skips retired cards.
      await retireMissing(
        tx,
        retireTargets.cards,
        cardSeeds.map((s) => s.slug),
        'retired cards no longer in seed',
      );

      const { matched, total } = await rematchAccounts(tx);

      console.log(
        `Seeded ${cardSeeds.length} card(s), ${categoryCount} categories, ` +
          `${creditCategorySeeds.length} credit categories. ` +
          `${matched}/${total} account(s) matched to a card.`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  logFatalAndExit('seed failed:', err);
});
