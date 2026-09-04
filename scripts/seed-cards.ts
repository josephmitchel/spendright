// Upserts src/db/cards.seed.ts into Postgres and re-matches accounts to cards.
// Run with: npm run seed:cards

// Must stay the FIRST import: it loads .env.local, and every import below it
// is evaluated after it, which is the only reason env is set by the time they
// run. Writing `config({ path: '.env.local' })` inline here instead would run
// it AFTER all of them — see scripts/load-env.ts for why.
import './load-env';

import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cardSeeds, creditCategorySeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, creditCategories, transactions } from '../src/db/schema';
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
    // Backfill missing rates FIRST, while every category link this run may
    // sever still exists. reward_rate is a snapshot of the rate when the
    // user picked the category, so this only fills gaps — editing a rate in
    // the seed file must NOT restate what past transactions already earned.
    //
    // Deliberately before the re-match wipe below, not after: a category
    // dropped from the seed file is deleted inside the reconcile and the FK
    // set-nulls its links, so a backfill running later would find nothing
    // to read the rate from and that row would lose its rate for good.
    // The cost of this order is that a link belonging to a card the account
    // is moving AWAY from gets stamped before the wipe clears it — accepted,
    // and consistent with the wipe keeping non-null rates as history: the
    // user did pick that card's category and did earn that rate. Removing a
    // category from the seed is routine; an account changing cards is not.
    //
    // Its OWN transaction, deliberately outside the reconcile below. Inside
    // it, this one statement locks every categorized transaction row and holds
    // those locks through the upserts, deletes and per-account wipes — while
    // syncItem's upsert loop (src/lib/sync.ts) locks transaction rows in
    // Plaid's order. Two overlapping row sets locked in different orders is a
    // deadlock, and Postgres resolves it by aborting one side with 40P01: the
    // seed (rerunnable) or the sync (its cursor update lost, replaying into
    // the same race). Splitting it costs no correctness — the ordering that
    // matters is only that it runs BEFORE the deletes, and it is idempotent
    // (`where reward_rate is null`), so a crash between the two statements
    // just means the next run redoes it.
    //
    // Narrowing, not a cure: the reconcile below still takes transactions-row
    // locks three ways — the `on delete set null` cascade from the
    // card_categories delete, the same cascade from the cards delete, and the
    // per-account wipe's own update — so a seed running against a live sync can
    // still deadlock. What the split removes is the version where a single
    // statement had every categorized row locked for the whole reconcile, which
    // made the overlap close to certain rather than incidental.
    await rootDb.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is null
    `);

    // One transaction: the reconcile is a single consistent step, so a
    // failure part-way through cannot leave deleted cards alongside stale
    // account matches.
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
        const [card] = await tx
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
          await tx
            .insert(cardCategories)
            .values(categoryValues)
            .onConflictDoUpdate({
              target: [cardCategories.cardId, cardCategories.name],
              set: { rate: categoryValues.rate, updatedAt: sql`now()` },
            });
          categoryCount++;
        }

        // An empty seed list means "this card has no categories", so the
        // filter is simply omitted and every category for the card goes. The
        // credit-category and zombie-card deletes below use the same explicit
        // shape rather than relying on how drizzle renders an empty array.
        const seedNames = seed.categories.map((c) => c.name);
        const removed = await tx
          .delete(cardCategories)
          .where(
            and(
              eq(cardCategories.cardId, card.id),
              seedNames.length > 0 ? notInArray(cardCategories.name, seedNames) : undefined,
            ),
          )
          .returning({ name: cardCategories.name });
        if (removed.length > 0) {
          console.log(
            `  ${seed.slug}: removed categories no longer in seed: ${removed.map((r) => r.name).join(', ')}`,
          );
        }
      }

      // Reconcile the global credit (inflow) categories: upsert by name, then
      // delete removed ones — the FK set-nulls transactions.credit_category_id.
      // No rate cleanup needed; credit assignments never write reward_rate.
      // Guarded for the same reason as the deletes: an empty seed list means
      // "no credit categories", and drizzle throws on values([]) rather than
      // rendering an insert of no rows.
      if (creditCategorySeeds.length > 0) {
        await tx
          .insert(creditCategories)
          .values(creditCategorySeeds.map((name) => ({ name })))
          .onConflictDoNothing({ target: creditCategories.name });
      }
      const removedCredit = await tx
        .delete(creditCategories)
        .where(
          creditCategorySeeds.length > 0
            ? notInArray(creditCategories.name, creditCategorySeeds)
            : undefined,
        )
        .returning({ name: creditCategories.name });
      if (removedCredit.length > 0) {
        console.log(
          `  removed credit categories no longer in seed: ${removedCredit.map((r) => r.name).join(', ')}`,
        );
      }

      // Remove cards that are no longer in the seed file. Their categories
      // cascade-delete, which set-nulls transactions.card_category_id while
      // leaving each transaction's recorded reward_rate intact.
      const seedSlugs = cardSeeds.map((s) => s.slug);
      const zombies = await tx
        .delete(cards)
        .where(seedSlugs.length > 0 ? notInArray(cards.slug, seedSlugs) : undefined)
        .returning({ slug: cards.slug });
      if (zombies.length > 0) {
        console.log(`  removed cards no longer in seed: ${zombies.map((z) => z.slug).join(', ')}`);
      }

      // Re-match every account to a card by Plaid account name, then clear any
      // transaction whose category link belongs to a card that is not the
      // account's. Keying off the links rather than off the stored card_id
      // catches a move that passes through "no card" too — an issuer rename
      // drops the match on one run, a later run matches a different card —
      // which a card_id-to-card_id comparison misses in both steps, leaving
      // the old card's categories and rates on the account's transactions.
      // Each recorded reward_rate is kept: it is history. An account with no
      // card clears nothing: it is an unsupported account until the seed file
      // catches up with the rename (see the supported-account rule at the top
      // of src/app/accounts/[accountId]/page.tsx), and a card actually deleted
      // from the seed already set-nulls those links by FK. Credit category
      // assignments are global, so they survive a card change either way.
      const cardList = await tx.select().from(cards).orderBy(cards.id);
      const accountList = await tx.select().from(accounts);
      let matched = 0;
      for (const account of accountList) {
        const card = matchCard(cardList, account.name);
        if (card) {
          matched++;
          const wiped = await tx
            .update(transactions)
            .set({ cardCategoryId: null, updatedAt: sql`now()` })
            .where(
              and(
                eq(transactions.accountId, account.accountId),
                inArray(
                  transactions.cardCategoryId,
                  tx
                    .select({ id: cardCategories.id })
                    .from(cardCategories)
                    .where(ne(cardCategories.cardId, card.id)),
                ),
              ),
            )
            .returning({ id: transactions.id });
          if (wiped.length > 0) {
            console.log(
              `  account "${account.name}": cleared card categories belonging to another card on ${wiped.length} transaction(s) (rates kept)`,
            );
          }
        }
        if ((card?.id ?? null) !== account.cardId) {
          await tx
            .update(accounts)
            .set({ cardId: card?.id ?? null, updatedAt: sql`now()` })
            .where(eq(accounts.id, account.id));
          console.log(`  account "${account.name}" -> ${card ? card.slug : 'no card'}`);
        }
      }

      // No cleanup of rates whose category link was severed: reward_rate is a
      // historical snapshot of what a transaction earned, so it outlives the
      // category that produced it. A row with a rate and no category link is
      // history, not garbage.

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
