import { sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
import { items, type ItemRow } from '@/db/schema';
import { storeAccounts, type StoreFailure } from '@/lib/accounts';
import { loadCardCatalog } from '@/lib/card-catalog';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { loggableError } from '@/lib/log';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { recordSyncFailure, syncItem, type SyncItemResult } from '@/lib/sync';

type PlaidItem = Awaited<ReturnType<typeof getItem>>;
type Institution = Awaited<ReturnType<typeof getInstitutionById>>;

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

// Persists the freshly exchanged token before anything else can fail: from
// here the item is visible locally (it can be synced or removed), so a
// transient failure in the enrichment calls below can no longer orphan a
// live Plaid Item behind a discarded token. Design: token-stored-before-enrichment.
async function storeItemShell(itemId: string, accessToken: string): Promise<void> {
  const encrypted = encrypt(accessToken);
  await db
    .insert(items)
    .values({ itemId, accessToken: encrypted })
    .onConflictDoUpdate({
      target: items.itemId,
      set: { accessToken: encrypted, updatedAt: sql`now()` },
    });
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

// The link is committed by now; a failed first sync is recorded on the item
// row and in the result, and the link still succeeds.
// Design: initial-sync-reported-not-thrown.
async function runInitialSync(
  storedItem: ItemRow,
  plaidAccounts: AccountBase[],
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    // Passes the accountsGet result so the sync stores nothing itself — the
    // link flow already stored these accounts — and caps the not-ready poll.
    // Design: not-ready-poll-budgets, accounts-refreshed-per-sync.
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

// Renders the store failures as user-facing messages. There is no second
// store pass to reconcile against: the link flow is the sole owner of this
// batch's account storage, and a transiently failed account is re-stored by
// the next sync, its rows held by the known-account guard until then.
// Design: accounts-refreshed-per-sync, bounded-cursor-hold.
function accountFailureMessages(failures: StoreFailure[]): string[] {
  return failures.map(
    (failure) =>
      `${failure.account.name ?? failure.account.account_id}: ${publicErrorMessage(failure.error, 'could not be stored')}`,
  );
}

// The whole link-onboarding flow behind POST /api/exchange: exchange the
// public token, store the item and its accounts, run the first sync inline
// and report the store failures alongside the sync outcome.
// Design: inline-initial-sync, initial-sync-reported-not-thrown.
export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  // Stored immediately: everything after this line may fail without
  // orphaning the Plaid Item. Design: token-stored-before-enrichment.
  await storeItemShell(itemId, accessToken);
  const plaidItem = await getItem(accessToken);
  const plaidAccounts = await getAccounts(accessToken);
  const institution = await fetchInstitution(plaidItem.institution_id);
  const storedItem = await storeItem(itemId, accessToken, plaidItem, institution);

  const cardList = await loadCardCatalog(db);
  // Failures are reported, not thrown. This is the batch's only store pass;
  // the initial sync is told the accounts are already stored.
  // Design: initial-sync-reported-not-thrown, accounts-refreshed-per-sync.
  const storeFailures = await storeAccounts(plaidAccounts, itemId, cardList);
  const sync = await runInitialSync(storedItem, plaidAccounts);
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
