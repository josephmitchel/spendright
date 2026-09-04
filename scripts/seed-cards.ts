// Upserts src/db/cards.seed.ts into Postgres and re-matches accounts to cards.
// Run with: npm run seed:cards

// Must stay the FIRST import: it loads .env.local, and every import below it
// is evaluated after it, which is the only reason env is set by the time they
// run. Writing `config({ path: '.env.local' })` inline here instead would run
// it AFTER all of them — see scripts/load-env.ts for why.
import './load-env';

import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cardSeeds, creditCategorySeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, creditCategories } from '../src/db/schema';
import { matchCard } from '../src/lib/cards';

// A Plaid account name may appear on only one card: matchCard takes the first
// hit, so a name listed twice would make an account's card — and therefore
// which categories its transactions can use — depend on row order.
//
// A blank entry is rejected for a different reason. Normally it is simply
// inert — a placeholder or a typo that matches no real account, and the user
// debugs an unsupported account by hand with nothing pointing at the cause.
// It is not always inert: matchCard's only blank guard is `if (!accountName)`,
// so a whitespace-only Plaid account name is truthy, normalizes to '' here too,
// and would inherit this card's categories. Neither outcome is ever intended,
// so fail on the seed file rather than defend against it downstream.
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

// A card may list a category name only once. Each category is a separate
// upsert against the (card_id, name) unique index, so a repeat takes the
// DO UPDATE branch and overwrites the first one's rate: the card silently ends
// up with whichever rate was listed last, and the count printed at the end
// over-reports. Compared case-insensitively, one step stricter than the index:
// "Gas" and "gas" would survive as two separate rows, which is not an
// overwrite but is two near-identical entries in every picker.
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

// The same rule for the global credit categories, for the same reason as the
// card-side check above — a duplicate just shows up differently. These insert
// with onConflictDoNothing on the name, so an exact repeat is swallowed
// silently and only over-reports in the count printed at the end. The case
// variant is the real damage: the unique index is exact, so "Other" and
// "other" both survive as separate rows and every inflow picker shows two
// near-identical entries. Compared case-insensitively to catch both.
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

  // pg reads a missing connectionString as "use the PG* env vars and libpq
  // defaults" (localhost, $USER) rather than as an error, so an unloaded
  // .env.local would quietly point this script's deletes at whatever database
  // happens to be listening. Fail before the pool exists.
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — check .env.local (or .env) before running the seed');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rootDb = drizzle(pool);

  try {
    // Backfill missing rates. reward_rate is a snapshot of the rate when the
    // user picked the category, so this only fills gaps — editing a rate in
    // the seed file must NOT restate what past transactions already earned.
    // Every link it reads through still exists, because the reconcile below
    // retires categories rather than deleting them; the order between the two
    // no longer matters for correctness, only for keeping this statement's
    // locks out of the reconcile's transaction.
    //
    // Its OWN transaction, deliberately outside the reconcile below. Inside
    // it, this one statement locks every categorized transaction row and holds
    // those locks through the upserts and retirements — while syncItem's
    // upsert loop (src/lib/sync.ts) locks transaction rows in Plaid's order.
    // Two overlapping row sets locked in different orders is a deadlock, and
    // Postgres resolves it by aborting one side with 40P01: the seed
    // (rerunnable) or the sync (its cursor update lost, replaying into the
    // same race). It is idempotent (`where reward_rate is null`), so a crash
    // between the two statements just means the next run redoes it.
    //
    // With no deletes and no per-account wipe, the reconcile below touches no
    // transactions rows at all, so the remaining overlap with a live sync is
    // this statement alone.
    await rootDb.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is null
    `);

    // One transaction: the reconcile is a single consistent step, so a
    // failure part-way through cannot leave retired cards alongside stale
    // account matches.
    //
    // RETIRE, NEVER DELETE (decided 2026-09-04). A card, card category or
    // credit category that has left the seed file gets `retired_at` stamped
    // and stays in its table, so every transaction categorized with it keeps
    // both the category link and the rate: a categorization is a historical
    // record and a card-side change must not rewrite it. Deleting set-nulled
    // the link on every old row by FK, which is exactly that rewrite. Retired
    // rows are not offered (matchCard, GET /api/cards and PATCH all skip them),
    // and re-adding the slug or name clears the stamp on the same row, so old
    // links point at the revived row with nothing to migrate.
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
        // `retiredAt: null` in the update set is what revives a card whose
        // slug came back into the file.
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

        // An empty seed list means "this card has no categories", so the
        // filter is simply omitted and every category for the card is
        // retired. The credit-category and card retirements below use the
        // same explicit shape rather than relying on how drizzle renders an
        // empty array. `retired_at is null` keeps the stamp at the moment the
        // row first left the file rather than moving it on every run.
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

      // Reconcile the global credit (inflow) categories: upsert by name (which
      // also revives a retired one), then retire the ones no longer listed.
      // Guarded for the same reason as the retirements: an empty seed list
      // means "no credit categories", and drizzle throws on values([]) rather
      // than rendering an insert of no rows.
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

      // Retire cards that are no longer in the seed file. Their categories are
      // left as they are: matchCard skips a retired card, so no account keeps
      // matching it and none of its categories can be picked, while every
      // transaction that already carries one keeps it. Re-adding the slug
      // revives the card and its still-listed categories together.
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

      // Re-match every account to a card by Plaid account name. That is ALL
      // this loop does to an account: an account's card is a fixed fact, and a
      // null match is only a temporary naming mismatch (the account is
      // unsupported until the seed file lists the new name — see the
      // supported-account rule at the top of
      // src/app/accounts/[accountId]/page.tsx). Nothing here touches
      // transactions: saved categories and rates are never cleared on the
      // strength of what the account currently matches. matchCard skips
      // retired cards, so an account whose card just left the file drops to
      // "no card" here in the same transaction.
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
