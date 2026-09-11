import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { items } from '@/db/schema';
import { decrypt, encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { rotateAccessTokens, type RotationSummary } from '@/lib/rotate-key';
import { endPools, itemRow, seedItem, truncateAll } from '../../test/db-fixtures';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

const savedEnv = {
  key: process.env.ENCRYPTION_KEY,
  previous: process.env.ENCRYPTION_KEY_PREVIOUS,
};

// rotateAccessTokens takes a plain NodePgDatabase; the app db's schema
// generic is irrelevant to the two builders it uses.
const database = db as unknown as Parameters<typeof rotateAccessTokens>[0];

function startRotation(): void {
  process.env.ENCRYPTION_KEY = KEY_B;
  process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
}

beforeEach(async () => {
  // Seed under the "old" key so a rotation to KEY_B is a real re-encryption.
  process.env.ENCRYPTION_KEY = KEY_A;
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  await truncateAll();
  await seedItem('itm-1');
});

afterEach(() => {
  process.env.ENCRYPTION_KEY = savedEnv.key;
  if (savedEnv.previous === undefined) delete process.env.ENCRYPTION_KEY_PREVIOUS;
  else process.env.ENCRYPTION_KEY_PREVIOUS = savedEnv.previous;
});

afterAll(async () => {
  await endPools();
});

describe('rotateAccessTokens', () => {
  it('re-encrypts every token under the current key', async () => {
    await seedItem('itm-2');
    startRotation();

    const summary = await rotateAccessTokens(database);
    expect(summary).toEqual<RotationSummary>({ rotated: 2, skipped: [], total: 2 });

    // The fallback key is gone and the tokens still decrypt: they were
    // genuinely rewritten under KEY_B.
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decrypt((await itemRow('itm-1')).accessToken)).toBe('token-itm-1');
    expect(decrypt((await itemRow('itm-2')).accessToken)).toBe('token-itm-2');
  });

  it('skips a row whose ciphertext changed between read and write', async () => {
    await seedItem('itm-2');
    startRotation();

    // A relink lands right after the rotation's read: the compare-and-swap
    // must keep the live server's write, not clobber it with a re-encryption
    // of the stale predecessor.
    type SelectChain = (fields: unknown) => { from: (table: unknown) => Promise<unknown[]> };
    const realSelect = database.select.bind(database) as SelectChain;
    const tampered = {
      select: (fields: unknown) => ({
        from: async (table: unknown) => {
          const rows = await realSelect(fields).from(table);
          await db
            .update(items)
            .set({ accessToken: encrypt('token-live') })
            .where(eq(items.itemId, 'itm-2'));
          return rows;
        },
      }),
      update: database.update.bind(database),
    } as unknown as typeof database;

    const summary = await rotateAccessTokens(tampered);
    expect(summary).toEqual<RotationSummary>({ rotated: 1, skipped: ['itm-2'], total: 2 });

    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decrypt((await itemRow('itm-1')).accessToken)).toBe('token-itm-1');
    expect(decrypt((await itemRow('itm-2')).accessToken)).toBe('token-live');
  });

  it('is safe to rerun after a partial pass', async () => {
    startRotation();
    await rotateAccessTokens(database);

    const again = await rotateAccessTokens(database);
    expect(again).toEqual<RotationSummary>({ rotated: 1, skipped: [], total: 1 });

    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decrypt((await itemRow('itm-1')).accessToken)).toBe('token-itm-1');
  });
});
