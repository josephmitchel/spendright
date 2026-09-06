import { sql } from 'drizzle-orm';
import type { AccountBase } from 'plaid';
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

// The inline initial sync's cap on the not-ready poll (about 6s), named so
// both poll budgets are equally discoverable next to plaid.ts's
// DEFAULT_NOT_READY_RETRIES. Design: not-ready-poll-budgets.
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

// Persists the freshly exchanged token before anything else can fail: from
// here the item is visible locally (it can be synced or removed), so a
// transient failure in the enrichment calls below can no longer orphan a
// live Plaid Item behind a discarded token. Returns the ciphertext it wrote,
// which storeItem below re-writes verbatim — the token is encrypted exactly
// once per link. Design: token-stored-before-enrichment.
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

// Upserts the item row and returns it as written. The full row comes back via
// .returning(): it is the committed item this link's result and the initial
// sync run against, with no re-read that could fail after commit.
// Design: initial-sync-reported-not-thrown.
async function storeItem(
  itemId: string,
  encryptedAccessToken: string,
  plaidItem: PlaidItem,
  institution: Institution | null,
): Promise<ItemRow> {
  // Split by update policy so the on-conflict set is derived, never a
  // hand-restated subset that a new column could silently miss (the same
  // derive-don't-restate rule as typed-api-contract): everything in
  // `alwaysUpdated` is written on insert and re-link alike, while the
  // institution columns are conditional — on re-link, ones whose fetch
  // failed are left out rather than nulled.
  // Design: relink-preserves-institution-metadata.
  const alwaysUpdated = {
    itemId,
    accessToken: encryptedAccessToken,
    availableProducts: plaidItem.available_products ?? [],
    billedProducts: plaidItem.billed_products ?? [],
  };
  const institutionValues = {
    institutionId: plaidItem.institution_id ?? null,
    institutionName: institution?.name ?? plaidItem.institution_name ?? null,
    institutionLogo: institution?.logo ?? null,
    institutionPrimaryColor: institution?.primaryColor ?? null,
  };
  const institutionUpdate: Partial<typeof institutionValues> = {};
  if (institutionValues.institutionId !== null) {
    institutionUpdate.institutionId = institutionValues.institutionId;
  }
  if (institution) {
    institutionUpdate.institutionName = institutionValues.institutionName;
    institutionUpdate.institutionLogo = institutionValues.institutionLogo;
    institutionUpdate.institutionPrimaryColor = institutionValues.institutionPrimaryColor;
  } else if (institutionValues.institutionName !== null) {
    institutionUpdate.institutionName = institutionValues.institutionName;
  }

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
  plaidAccounts: AccountBase[],
): Promise<{ result: SyncItemResult | null; error: string | null }> {
  try {
    // Passes the accountsGet result so the sync stores nothing itself — the
    // link flow already stored these accounts — and caps the not-ready poll.
    // Design: not-ready-poll-budgets, accounts-refreshed-per-sync.
    const result = await syncItem(storedItem, {
      plaidAccounts,
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

// Renders the store failures as user-facing messages. There is no second
// store pass to reconcile against: the link flow is the sole owner of this
// batch's account storage, and a transiently failed account is re-stored by
// the next sync, its rows held by the known-account guard until then.
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

// The whole link-onboarding flow behind POST /api/exchange: exchange the
// public token, store the item and its accounts, run the first sync inline
// and report the store failures alongside the sync outcome.
// Design: inline-initial-sync, initial-sync-reported-not-thrown.
export async function linkItem(publicToken: string): Promise<LinkResult> {
  const { accessToken, itemId } = await exchangePublicToken(publicToken);
  // Stored immediately: everything after this line may fail without
  // orphaning the Plaid Item. Design: token-stored-before-enrichment.
  const encryptedAccessToken = await storeItemShell(itemId, accessToken);
  // Independent Plaid reads, in parallel: this route runs the initial sync
  // inline and is the latency-sensitive one. Design: inline-initial-sync.
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
