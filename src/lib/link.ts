import { sql } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';
import { accountDisplayName } from '@/lib/account-display';
import { storeAccounts, type StoreFailure } from '@/lib/accounts';
import { loadCardCatalog } from '@/lib/card-catalog';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { recordSyncFailure, syncItem, type SyncItemResult } from '@/lib/sync';

type PlaidItem = Awaited<ReturnType<typeof getItem>>;
type Institution = Awaited<ReturnType<typeof getInstitutionById>>;

// Cap on the inline initial sync's not-ready poll (about 6s).
// Design: not-ready-poll-budgets.
const INITIAL_SYNC_NOT_READY_RETRIES = 3;

export interface LinkResult {
  itemId: string;
  // From the row as written, which may have kept a previously stored name.
  institutionName: string | null;
  accountsStored: number;
  sync: SyncItemResult | null;
  syncError: string | null;
  accountErrors: string[];
}

// Best-effort: metadata is cosmetic, and a re-link keeps what is already
// stored. Design: relink-preserves-institution-metadata.
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

// Persists the freshly exchanged token before anything else can fail.
// Returns the ciphertext it wrote, which storeItem re-writes verbatim.
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

// Upserts the item row and returns it as written (no re-read that could fail
// after commit). Design: initial-sync-reported-not-thrown.
async function storeItem(
  itemId: string,
  encryptedAccessToken: string,
  plaidItem: PlaidItem,
  institution: Institution | null,
): Promise<ItemRow> {
  // Split by update policy: everything in `alwaysUpdated` is written on
  // insert and re-link alike, while the institution columns are conditional.
  // Design: relink-preserves-institution-metadata.
  const alwaysUpdated = {
    itemId,
    accessToken: encryptedAccessToken,
  };
  const institutionValues = {
    institutionId: plaidItem.institution_id ?? null,
    institutionName: institution?.name ?? plaidItem.institution_name ?? null,
    institutionLogo: institution?.logo ?? null,
    institutionPrimaryColor: institution?.primaryColor ?? null,
  };
  // The id and name update whenever known (both can come from the item
  // itself); every other key is fetched metadata that updates only when the
  // fetch succeeded, so a failed fetch never nulls a stored value.
  const knownWithoutFetch: ReadonlyArray<keyof typeof institutionValues> = [
    'institutionId',
    'institutionName',
  ];
  const institutionUpdate = Object.fromEntries(
    Object.entries(institutionValues).filter(([key, value]) =>
      knownWithoutFetch.includes(key as keyof typeof institutionValues)
        ? value !== null
        : institution !== null,
    ),
  ) as Partial<typeof institutionValues>;

  const [storedItem] = await db
    .insert(items)
    .values({ ...alwaysUpdated, ...institutionValues })
    .onConflictDoUpdate({
      target: items.itemId,
      set: { ...alwaysUpdated, ...institutionUpdate, updatedAt: sql`now()` },
    })
    .returning();
  if (!storedItem) {
    // An upsert with .returning() always yields the row; satisfies the
    // checked index access.
    throw new Error(`item upsert returned no row for ${itemId}`);
  }
  return storedItem;
}

// The link is committed by now; a failed first sync is recorded on the item
// row and in the result, and the link still succeeds.
// Design: initial-sync-reported-not-thrown.
async function runInitialSync(
  storedItem: ItemRow,
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    // The link flow already stored this batch's accounts; the not-ready poll
    // is capped for this latency-sensitive route.
    // Design: not-ready-poll-budgets, accounts-refreshed-per-sync.
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

// Renders the store failures as user-facing messages.
// Design: accounts-refreshed-per-sync, bounded-cursor-hold.
function accountFailureMessages(failures: StoreFailure[]): string[] {
  return failures.map((failure) => {
    const name = accountDisplayName({
      name: failure.account.name ?? null,
      officialName: failure.account.official_name ?? null,
      accountId: failure.account.account_id,
    });
    return `${name}: ${publicErrorMessage(failure.error, 'could not be stored')}`;
  });
}

// The link-onboarding flow behind POST /api/exchange.
// Design: inline-initial-sync, initial-sync-reported-not-thrown.
export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  // Stored immediately: everything after this line may fail without
  // orphaning the Plaid Item. Design: token-stored-before-enrichment.
  const encryptedAccessToken = await storeItemShell(itemId, accessToken);
  // Independent Plaid reads, in parallel. Design: inline-initial-sync.
  const [plaidItem, plaidAccounts] = await Promise.all([
    getItem(accessToken),
    getAccounts(accessToken),
  ]);
  const institution = await fetchInstitution(plaidItem.institution_id);
  const storedItem = await storeItem(itemId, encryptedAccessToken, plaidItem, institution);

  const cardList = await loadCardCatalog(db);
  // Failures are reported, not thrown. This is the batch's only store pass;
  // the initial sync is told the accounts are already stored.
  // Design: initial-sync-reported-not-thrown, accounts-refreshed-per-sync.
  const storeFailures = await storeAccounts(plaidAccounts, itemId, cardList);
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
