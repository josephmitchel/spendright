import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cards, items } from '@/db/schema';
import { upsertAccount } from '@/lib/accounts';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { syncItem, type SyncItemResult } from '@/lib/sync';

// Unauthenticated and long-running (several Plaid calls plus the first sync
// inline). Design: single-user-localhost-no-auth, inline-initial-sync.
export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const publicToken = (body as { public_token?: unknown } | null)?.public_token;
    if (typeof publicToken !== 'string' || !publicToken) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'public_token is required' } },
        { status: 400 },
      );
    }

    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const plaidItem = await getItem(accessToken);
    const plaidAccounts = await getAccounts(accessToken);

    let institution: { name: string; logo: string | null; primaryColor: string | null } | null =
      null;
    if (plaidItem.institution_id) {
      try {
        institution = await getInstitutionById(plaidItem.institution_id);
      } catch (err) {
        console.error('institutionsGetById failed (continuing without metadata):', err);
      }
    }

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
    const institutionUpdate = {
      ...(itemValues.institutionId !== null ? { institutionId: itemValues.institutionId } : {}),
      ...(institution
        ? {
            institutionName: itemValues.institutionName,
            institutionLogo: itemValues.institutionLogo,
            institutionPrimaryColor: itemValues.institutionPrimaryColor,
          }
        : itemValues.institutionName !== null
          ? { institutionName: itemValues.institutionName }
          : {}),
    };
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
      .returning({ institutionName: items.institutionName });

    const cardList = await db.select().from(cards).orderBy(cards.id);

    // Account store failures are reported, not thrown; the initial sync below
    // retries every account, so the list is reconciled after it.
    // Design: initial-sync-reported-not-thrown.
    const accountFailures: { accountId: string; message: string }[] = [];
    for (const account of plaidAccounts) {
      const label = account.name ?? account.account_id;
      try {
        await db.transaction(async (tx) => {
          await upsertAccount(tx, account, itemId, cardList);
        });
      } catch (err) {
        console.error(`Failed to store account ${account.account_id} for item ${itemId}:`, err);
        accountFailures.push({
          accountId: account.account_id,
          message: `${label}: ${publicErrorMessage(err, 'could not be stored')}`,
        });
      }
    }

    const [itemRow] = await db.select().from(items).where(eq(items.itemId, itemId));

    // The link is committed by now; a failed first sync is recorded on the
    // item row and in the response, and the link still returns 200.
    let syncResult: SyncItemResult | null = null;
    let syncError: string | null = null;
    try {
      // Reuses the accountsGet result (all accounts, including any that failed
      // to store) and caps the not-ready poll. Design: not-ready-poll-budgets.
      syncResult = await syncItem(itemRow, { plaidAccounts, notReadyRetries: 3 });
    } catch (err) {
      console.error(`Initial sync failed for item ${itemId}:`, err);
      syncError = publicErrorMessage(err, 'Initial sync failed — check the server log');
      const plaidError = plaidErrorBody(err);
      // Recording the failure is best-effort; a failed write must not fail the link.
      try {
        await db
          .update(items)
          .set({ error: plaidError ?? { message: syncError }, updatedAt: sql`now()` })
          .where(eq(items.itemId, itemId));
      } catch (writeErr) {
        console.error(`Could not record the initial sync failure for item ${itemId}:`, writeErr);
      }
    }

    // Re-check against the database: the sync may have stored accounts that
    // failed above. If the read fails, the loop's list stands.
    let accountErrors = accountFailures.map((failure) => failure.message);
    if (accountFailures.length > 0) {
      try {
        const storedIds = new Set(
          (
            await db
              .select({ accountId: accounts.accountId })
              .from(accounts)
              .where(eq(accounts.itemId, itemId))
          ).map((row) => row.accountId),
        );
        accountErrors = accountFailures
          .filter((failure) => !storedIds.has(failure.accountId))
          .map((failure) => failure.message);
      } catch (err) {
        console.error(`Could not re-check stored accounts for item ${itemId}:`, err);
      }
    }

    return NextResponse.json({
      item_id: itemId,
      // From the row as written, which may have kept a previously stored name.
      institution_name: storedItem?.institutionName ?? null,
      accounts: plaidAccounts.length - accountErrors.length,
      transactions: syncResult,
      sync_error: syncError,
      account_errors: accountErrors.length > 0 ? accountErrors : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
