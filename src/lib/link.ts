import { eq, sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { accounts, cards, items, type CardRow, type ItemRow } from '@/db/schema';
import { storeAccounts } from '@/lib/accounts';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { loggableError } from '@/lib/log';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { recordSyncFailure, syncItem, type SyncItemResult } from '@/lib/sync';

type PlaidItem = Awaited<ReturnType<typeof getItem>>;
type Institution = Awaited<ReturnType<typeof getInstitutionById>>;
type StoreFailure = { account: AccountBase; error: unknown };

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
    console.error('institutionsGetById failed (continuing without metadata):', loggableError(err));
    return null;
  }
}

// Upserts the item row and returns it as written. The full row comes back via
// .returning(): it is the committed item this link's result and the initial
// sync run against, with no re-read that could fail after commit.
// Design: initial-sync-reported-not-thrown.
async function storeItem(
  itemId: string,
  accessToken: string,
  plaidItem: PlaidItem,
  institution: Institution | null,
): Promise<ItemRow> {
  const itemValues = {
    itemId,
    accessToken: encrypt(accessToken),
    institutionId: plaidItem.institution_id ?? null,
    institutionName: institution?.name ?? plaidItem.institution_name ?? null,
    institutionLogo: institution?.logo ?? null,
    institutionPrimaryColor: institution?.primaryColor ?? null,
    availableProducts: plaidItem.available_products ?? [],
    billedProducts: plaidItem.billed_products ?? [],
  };
  // On re-link, institution columns whose fetch failed are left out of the
  // update rather than nulled. Design: relink-preserves-institution-metadata.
  const institutionUpdate: Partial<typeof itemValues> = {};
  if (itemValues.institutionId !== null) institutionUpdate.institutionId = itemValues.institutionId;
  if (institution) {
    institutionUpdate.institutionName = itemValues.institutionName;
    institutionUpdate.institutionLogo = itemValues.institutionLogo;
    institutionUpdate.institutionPrimaryColor = itemValues.institutionPrimaryColor;
  } else if (itemValues.institutionName !== null) {
    institutionUpdate.institutionName = itemValues.institutionName;
  }

  const [storedItem] = await db
    .insert(items)
    .values(itemValues)
    .onConflictDoUpdate({
      target: items.itemId,
      set: {
        itemId: itemValues.itemId,
        accessToken: itemValues.accessToken,
        availableProducts: itemValues.availableProducts,
        billedProducts: itemValues.billedProducts,
        ...institutionUpdate,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!storedItem) {
    // An upsert with .returning() always yields the row; satisfies the
    // checked index access.
    throw new Error(`item upsert returned no row for ${itemId}`);
  }
  return storedItem;
}

// Best-effort, like the sync path's account refresh: the initial sync
// re-reads cards and re-upserts every account, so a failure here only
// defers the card match. Design: initial-sync-reported-not-thrown.
async function loadCardCatalog(itemId: string): Promise<CardRow[]> {
  try {
    // Ordered so card matching never depends on physical row order.
    return await db.select().from(cards).orderBy(cards.id);
  } catch (err) {
    console.error(`Could not read cards for item ${itemId} — storing accounts unmatched:`, err);
    return [];
  }
}

// The link is committed by now; a failed first sync is recorded on the item
// row and in the result, and the link still succeeds.
// Design: initial-sync-reported-not-thrown.
async function runInitialSync(
  storedItem: ItemRow,
  plaidAccounts: AccountBase[],
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    // Reuses the accountsGet result (all accounts, including any that failed
    // to store) and caps the not-ready poll. Design: not-ready-poll-budgets.
    const result = await syncItem(storedItem, { plaidAccounts, notReadyRetries: 3 });
    return { result, error: null };
  } catch (err) {
    console.error(`Initial sync failed for item ${storedItem.itemId}:`, loggableError(err));
    const error = await recordSyncFailure(
      storedItem.itemId,
      err,
      'Initial sync failed — check the server log',
    );
    return { result: null, error };
  }
}

// Re-checks the store failures against the database — the initial sync
// re-upserts every account, so it may have stored accounts that failed the
// first pass — and renders the ones still missing as user-facing messages.
// If the re-check read fails, the original list stands.
async function unresolvedAccountFailures(
  itemId: string,
  failures: StoreFailure[],
): Promise<string[]> {
  if (failures.length === 0) return [];
  const messageFor = (failure: StoreFailure) =>
    `${failure.account.name ?? failure.account.account_id}: ${publicErrorMessage(failure.error, 'could not be stored')}`;
  try {
    const storedIds = new Set(
      (
        await db
          .select({ accountId: accounts.accountId })
          .from(accounts)
          .where(eq(accounts.itemId, itemId))
      ).map((row) => row.accountId),
    );
    return failures.filter((failure) => !storedIds.has(failure.account.account_id)).map(messageFor);
  } catch (err) {
    console.error(`Could not re-check stored accounts for item ${itemId}:`, err);
    return failures.map(messageFor);
  }
}

// The whole link-onboarding flow behind POST /api/exchange: exchange the
// public token, store the item and its accounts, run the first sync inline
// and reconcile the store failures against what that sync stored.
// Design: inline-initial-sync, initial-sync-reported-not-thrown.
export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  const plaidItem = await getItem(accessToken);
  const plaidAccounts = await getAccounts(accessToken);
  const institution = await fetchInstitution(plaidItem.institution_id);
  const storedItem = await storeItem(itemId, accessToken, plaidItem, institution);

  const cardList = await loadCardCatalog(itemId);
  // Failures are reported, not thrown; the initial sync below retries every
  // account, so the list is reconciled after it.
  // Design: initial-sync-reported-not-thrown.
  const storeFailures = await storeAccounts(plaidAccounts, itemId, cardList);
  const sync = await runInitialSync(storedItem, plaidAccounts);
  const accountErrors = await unresolvedAccountFailures(itemId, storeFailures);

  return {
    itemId,
    institutionName: storedItem.institutionName,
    accountsStored: plaidAccounts.length - accountErrors.length,
    sync: sync.result,
    syncError: sync.error,
    accountErrors,
  };
}
