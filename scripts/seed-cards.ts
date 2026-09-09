// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { and, eq, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { cardSeeds, creditCategorySeeds } from '../src/db/cards.seed';
import { accounts, cardCategories, cards, creditCategories } from '../src/db/schema';
import { loadCardCatalog } from '../src/lib/card-catalog';
import { matchCard, normalizeAccountName } from '../src/lib/cards';
import type { DrizzleTransaction } from '../src/lib/db';
import { requireDatabaseUrl } from '../src/lib/env';
import { logFatalAndExit, logInfo } from '../src/lib/log';
import { createBoundedPool } from '../src/lib/pool-config';

const MAX_PLAUSIBLE_RATE = 20;

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
  assertUniqueKeys(
    cardSeeds.map((seed) => ({ value: seed.slug, owner: seed.name })),
    {
      blank: (owner) => `cards.seed.ts: "${owner}" has a blank slug`,
      duplicate: (value) => `cards.seed.ts: slug "${value}" is used by more than one card`,
    },
  );

  assertUniqueKeys(
    cardSeeds.map((seed) => ({ value: seed.name, owner: seed.slug })),
    {
      blank: (owner) => `cards.seed.ts: "${owner}" has a blank name`,
      duplicate: (value) => `cards.seed.ts: name "${value}" is used by more than one card`,
    },
  );

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

  for (const seed of cardSeeds) {
    assertUniqueKeys(
      seed.categories.map((category) => ({ value: category.name, owner: seed.slug })),
      {
        blank: (owner) => `cards.seed.ts: "${owner}" lists a blank category name`,
        duplicate: (value, _firstOwner, owner) =>
          `cards.seed.ts: "${owner}" lists the category "${value}" more than once`,
      },
    );

    // A typo'd rate would ship straight to the UI as authoritative reward
    // guidance; no real card pays more than MAX_PLAUSIBLE_RATE.
    for (const category of seed.categories) {
      if (
        !Number.isFinite(category.rate) ||
        category.rate <= 0 ||
        category.rate > MAX_PLAUSIBLE_RATE
      ) {
        throw new Error(
          `cards.seed.ts: "${seed.slug}" category "${category.name}" has an implausible rate ` +
            `(${category.rate}) — expected a number greater than 0 and at most ${MAX_PLAUSIBLE_RATE}`,
        );
      }
    }

    // An in-range typo passes the bound above, so rates also need human
    // provenance: when they were checked and against what.
    if (!seed.ratesVerified.source.trim()) {
      throw new Error(`cards.seed.ts: "${seed.slug}" ratesVerified.source is blank`);
    }
    const verifiedOn = new Date(seed.ratesVerified.on);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(seed.ratesVerified.on) || Number.isNaN(verifiedOn.getTime())) {
      throw new Error(
        `cards.seed.ts: "${seed.slug}" ratesVerified.on (${seed.ratesVerified.on}) must be a ` +
          'YYYY-MM-DD date',
      );
    }
    if (verifiedOn.getTime() > Date.now()) {
      throw new Error(`cards.seed.ts: "${seed.slug}" ratesVerified.on is in the future`);
    }
  }

  assertUniqueKeys(
    creditCategorySeeds.map((name) => ({ value: name, owner: 'creditCategorySeeds' })),
    {
      blank: () => 'cards.seed.ts: creditCategorySeeds lists a blank name',
      duplicate: (value) => `cards.seed.ts: creditCategorySeeds lists "${value}" more than once`,
    },
  );
}

type SeedTransaction = DrizzleTransaction<NodePgDatabase>;

type SeedTable = typeof cards | typeof cardCategories | typeof creditCategories;
interface RetireTarget<Table extends SeedTable = SeedTable> {
  table: Table;
  keyColumn: Extract<Table[keyof Table], AnyPgColumn>;
}
const retireTargets = {
  cards: { table: cards, keyColumn: cards.slug },
  cardCategories: { table: cardCategories, keyColumn: cardCategories.name },
  creditCategories: { table: creditCategories, keyColumn: creditCategories.name },
} satisfies {
  cards: RetireTarget<typeof cards>;
  cardCategories: RetireTarget<typeof cardCategories>;
  creditCategories: RetireTarget<typeof creditCategories>;
};

// Empty keptKeys omits the clause — same as the `true` drizzle renders notInArray([]) into (Verified-on: drizzle-orm@0.45.2).
async function retireMissing<Table extends SeedTable>(
  tx: SeedTransaction,
  { table, keyColumn }: RetireTarget<Table>,
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
    logInfo(`  ${label}: ${retired.map((row) => row.key).join(', ')}`);
  }
}

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

// drizzle throws on values([]) (Verified-on: drizzle-orm@0.45.2).
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
      logInfo(`  account "${account.name}" -> ${card ? card.slug : 'no card'}`);
    }
  }
  return { matched, total: accountList.length };
}

async function main() {
  assertSeedIsValid();

  // Own pool, not src/lib/db's singleton (that module is server-only) — the
  // script must end() it so the process can exit.
  const pool = createBoundedPool(requireDatabaseUrl());
  const rootDb = drizzle(pool);

  try {
    // Outside the reconcile transaction so its row locks can't deadlock with a sync.
    await rootDb.execute(sql`
      update transactions t
      set reward_rate = cc.rate
      from card_categories cc
      where t.card_category_id = cc.id and t.reward_rate is null
    `);

    await rootDb.transaction(async (tx) => {
      const categoryCount = await upsertCards(tx);
      await upsertCreditCategories(tx);

      await retireMissing(
        tx,
        retireTargets.cards,
        cardSeeds.map((s) => s.slug),
        'retired cards no longer in seed',
      );

      const { matched, total } = await rematchAccounts(tx);

      logInfo(
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
