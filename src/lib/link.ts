import { eq, sql } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';
import { accountDisplayName } from '@/lib/account-display';
import { refreshItemAccounts, type StoreFailure } from '@/lib/accounts';
import { decrypt, encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import {
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  getInstitutionById,
  getItem,
} from '@/lib/plaid';
import type { ProviderAccount, ProviderItem } from '@/lib/provider-types';
import { PublicError } from '@/lib/public-error';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { recordSyncFailure } from '@/lib/sync-outcome';

type Institution = Awaited<ReturnType<typeof getInstitutionById>>;

const INITIAL_SYNC_NOT_READY_RETRIES = 3;

export interface LinkResult {
  itemId: string;
  institutionName: string | null;
  accountsStored: number;
  sync: SyncItemResult | null;
  syncError: string | null;
  // True when enrichment failed before any sync attempt, so callers don't
  // describe syncError as a sync failure.
  setupFailed: boolean;
  accountErrors: string[];
}

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

async function runInitialSync(
  storedItem: ItemRow,
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    const result = await syncItem(storedItem.itemId, {
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

export async function createRepairLinkToken(itemId: string): Promise<string> {
  const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
  if (!item) {
    throw new PublicError('Item not found', { status: 404, code: 'NOT_FOUND' });
  }
  return createLinkToken(decrypt(item.accessToken));
}

export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  const encryptedAccessToken = await storeItemShell(itemId, accessToken);

  // The shell row is already durable, so an enrichment failure is recorded on
  // it and reported — the home page then explains the new item instead of
  // showing an unlabeled orphan.
  let plaidItem: ProviderItem;
  let plaidAccounts: ProviderAccount[];
  let storedItem: ItemRow;
  try {
    [plaidItem, plaidAccounts] = await Promise.all([
      getItem(accessToken),
      getAccounts(accessToken),
    ]);
    const institution = await fetchInstitution(plaidItem.institutionId);
    storedItem = await storeItem(itemId, encryptedAccessToken, plaidItem, institution);
  } catch (err) {
    logError(`Link enrichment failed for item ${itemId}:`, err);
    const error = await recordSyncFailure(
      itemId,
      err,
      'Linking finished but account setup failed — sync again, or remove the institution',
    );
    return {
      itemId,
      institutionName: null,
      accountsStored: 0,
      sync: null,
      syncError: error,
      setupFailed: true,
      accountErrors: [],
    };
  }

  const storeFailures = await refreshItemAccounts(itemId, plaidAccounts);
  const sync = await runInitialSync(storedItem);
  const accountErrors = accountFailureMessages(storeFailures);

  return {
    itemId,
    institutionName: storedItem.institutionName,
    accountsStored: plaidAccounts.length - accountErrors.length,
    sync: sync.result,
    syncError: sync.error,
    setupFailed: false,
    accountErrors,
  };
}
