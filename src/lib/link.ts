import { sql } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';
import { accountDisplayName } from '@/lib/account-display';
import { refreshItemAccounts, type StoreFailure } from '@/lib/accounts';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import type { ProviderItem } from '@/lib/provider-types';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { recordSyncFailure } from '@/lib/sync-outcome';

type Institution = Awaited<ReturnType<typeof getInstitutionById>>;

// Design: not-ready-poll-budgets.
const INITIAL_SYNC_NOT_READY_RETRIES = 3;

export interface LinkResult {
  itemId: string;
  institutionName: string | null;
  accountsStored: number;
  sync: SyncItemResult | null;
  syncError: string | null;
  accountErrors: string[];
}

// Design: relink-preserves-institution-metadata.
async function fetchInstitution(
  institutionId: string | null | undefined,
): Promise<Institution | null> {
  if (!institutionId) return null;
  try {
    return await getInstitutionById(institutionId);
  } catch (err) {
    logError('institutionsGetById failed (continuing without metadata):', err);
    return null;
  }
}

// Design: token-stored-before-enrichment.
async function storeItemShell(itemId: string, accessToken: string): Promise<string> {
  const encrypted = encrypt(accessToken);
  await db
    .insert(items)
    .values({ itemId, accessToken: encrypted })
    .onConflictDoUpdate({
      target: items.itemId,
      set: { accessToken: encrypted, updatedAt: sql`now()` },
    });
  return encrypted;
}

async function storeItem(
  itemId: string,
  encryptedAccessToken: string,
  plaidItem: ProviderItem,
  institution: Institution | null,
): Promise<ItemRow> {
  // Design: relink-preserves-institution-metadata.
  const alwaysUpdated = {
    itemId,
    accessToken: encryptedAccessToken,
  };
  const institutionValues = {
    institutionId: plaidItem.institutionId,
    institutionName: institution?.name ?? plaidItem.institutionName,
    institutionLogo: institution?.logo ?? null,
    institutionPrimaryColor: institution?.primaryColor ?? null,
  };
  // A failed metadata fetch never nulls a stored value.
  const institutionUpdate = {
    ...(institutionValues.institutionId !== null && {
      institutionId: institutionValues.institutionId,
    }),
    ...(institutionValues.institutionName !== null && {
      institutionName: institutionValues.institutionName,
    }),
    ...(institution !== null && {
      institutionLogo: institutionValues.institutionLogo,
      institutionPrimaryColor: institutionValues.institutionPrimaryColor,
    }),
  };

  const [storedItem] = await db
    .insert(items)
    .values({ ...alwaysUpdated, ...institutionValues })
    .onConflictDoUpdate({
      target: items.itemId,
      set: { ...alwaysUpdated, ...institutionUpdate, updatedAt: sql`now()` },
    })
    .returning();
  if (!storedItem) {
    throw new Error(`item upsert returned no row for ${itemId}`);
  }
  return storedItem;
}

// Design: initial-sync-reported-not-thrown.
async function runInitialSync(
  storedItem: ItemRow,
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    const result = await syncItem(storedItem, {
      accountsAlreadyStored: true,
      notReadyRetries: INITIAL_SYNC_NOT_READY_RETRIES,
    });
    return { result, error: null };
  } catch (err) {
    logError(`Initial sync failed for item ${storedItem.itemId}:`, err);
    const error = await recordSyncFailure(
      storedItem.itemId,
      err,
      'Initial sync failed — check the server log',
    );
    return { result: null, error };
  }
}

function accountFailureMessages(failures: StoreFailure[]): string[] {
  return failures.map((failure) => {
    const name = accountDisplayName({
      name: failure.account.name,
      officialName: failure.account.officialName,
      accountId: failure.account.accountId,
    });
    return `${name}: ${publicErrorMessage(failure.error, 'could not be stored')}`;
  });
}

// Design: inline-initial-sync, initial-sync-reported-not-thrown.
export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  const encryptedAccessToken = await storeItemShell(itemId, accessToken);
  const [plaidItem, plaidAccounts] = await Promise.all([
    getItem(accessToken),
    getAccounts(accessToken),
  ]);
  const institution = await fetchInstitution(plaidItem.institutionId);
  const storedItem = await storeItem(itemId, encryptedAccessToken, plaidItem, institution);

  const storeFailures = await refreshItemAccounts(itemId, plaidAccounts);
  const sync = await runInitialSync(storedItem);
  const accountErrors = accountFailureMessages(storeFailures);

  return {
    itemId,
    institutionName: storedItem.institutionName,
    accountsStored: plaidAccounts.length - accountErrors.length,
    sync: sync.result,
    syncError: sync.error,
    accountErrors,
  };
}
