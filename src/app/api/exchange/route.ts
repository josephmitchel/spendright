import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cards, items } from '@/db/schema';
import { upsertAccount } from '@/lib/accounts';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { syncItem, type SyncItemResult } from '@/lib/sync';

// BEFORE DEPLOYING — the canonical list, pointed at from the other routes.
// SpendRight is a single-user tool run on localhost, and these are deliberate
// for that and only that. Decided 2026-09-03; none is a bug report.
//
//  1. NO AUTHENTICATION, anywhere. Every route under /api is open: this one
//     mints and stores a Plaid access token, DELETE /api/items/[itemId] drops
//     an institution with all of its transactions, and the items table holds
//     encrypted bank credentials. Correct while nothing but the local browser
//     can reach it; a blocker the moment it is reachable from anywhere else.
//     Whatever gets added has to cover the mutating routes AND the reads —
//     /api/transactions is the account's whole financial history.
//
//  2. This route is LONG-RUNNING by nature. It makes five Plaid calls before
//     it answers, and the last of them paginates. The in-request sleeping is
//     capped but not gone (syncItem is called with notReadyRetries: 3 below,
//     ≈6s), and a first sync of an item with years of history is still many
//     round trips inside one request, so a host with a request timeout —
//     Vercel's hobby limit is 10s — will cut it off. The fix is structural: commit the item
//     and its accounts, return, and run the first sync as a background job the
//     client polls. Not worth building for a tool that runs on one machine.
export async function POST(req: NextRequest) {
  try {
    // Guarded exactly as PATCH /api/transactions/[transactionId] guards its
    // body. Unwrapped, a malformed body throws a SyntaxError that falls through
    // to errorResponse — and since that stopped echoing err.message, a plainly
    // bad request came back as an opaque 500 with no clue what was wrong.
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
    // A re-link of an item already in the table takes the DO UPDATE branch, so
    // whatever is in `set` REPLACES what is stored. institutionsGetById is
    // allowed to fail above — it is caught, logged, and `institution` stays
    // null — and spreading itemValues wholesale then wrote that failure into
    // the row: a good stored logo and primary colour were overwritten with
    // null, and the institution's icon vanished from the home page until some
    // later re-link happened to catch the API working. Same principle the two
    // client pages already apply to their loads: a read that failed is not
    // evidence about what it would have returned, so the columns it feeds are
    // left out of the update rather than nulled.
    //
    // institutionName is the one metadata field with a second source
    // (plaidItem.institution_name, from the itemGet that DID succeed), so it
    // is updated whenever either source produced a value and only withheld
    // when both came back empty. The insert path still writes every column —
    // there is nothing to preserve on a first link.
    //
    // institutionId gets the same treatment for the same reason: it is what
    // the preserved logo, name and colour were fetched WITH, so nulling it
    // while they stay leaves a row that disagrees with itself and no id to
    // re-fetch them by. A re-link that comes back without an institution_id is
    // the case — itemGet succeeding with the field absent, or a Plaid-side
    // hiccup — and either way the stored id is the better answer than null.
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
    // Read back rather than assumed, so the response below can report the name
    // that is actually in the row (see the note there).
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

    // Fetched once, not per account — matchCard works off the list. Ordered
    // so a match never depends on physical row order.
    const cardList = await db.select().from(cards).orderBy(cards.id);

    // Reported, not thrown, for the same reason the initial sync below is —
    // and it is the same failure this route already had the shape for but did
    // not apply here. The item row is committed and so is every account before
    // this one, each in its own transaction; letting account n's failure reach
    // the outer catch answered 500 and told the user "Exchange failed" for an
    // institution that is connected and half-populated. They re-link, and the
    // re-link hits the same broken account.
    //
    // Nothing here is lost by carrying on: the accounts that did commit are
    // usable, and re-running the link (or the next sync, which now upserts
    // accounts too — see src/lib/accounts.ts) retries the ones that did not.
    // Kept as records rather than as finished strings because the initial sync
    // below retries every one of these accounts, so which of them are still
    // failures is not known until after it — see the reconciliation there.
    const accountFailures: { accountId: string; message: string }[] = [];
    for (const account of plaidAccounts) {
      const label = account.name ?? account.account_id;
      try {
        // One transaction per account, because upsertAccount's category clear
        // is destructive and must not commit unless the card change that
        // justifies it does too — and per ACCOUNT rather than one for all of
        // them so a single bad account cannot roll back its siblings.
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

    // The link is DONE by this point: the item row and every account row are
    // committed, each in its own transaction. Letting a failed first sync throw
    // out of here reported the whole connection as failed for an institution
    // that is, in fact, connected — the user sees an error, refreshes, and
    // finds the institution sitting on the home page with no transactions. The
    // likeliest cause is also the most misleading one: Plaid often has not
    // finished preparing a brand-new item's transactions (src/lib/plaid.ts),
    // which is exactly the case that resolves itself on the next sync.
    //
    // So the sync is reported, not thrown: the same shape /api/sync uses. The
    // error goes on the item row, where HomeClient renders it under the
    // institution — the refresh onConnected() triggers is what puts it on
    // screen — and the response says the link succeeded, because it did.
    let syncResult: SyncItemResult | null = null;
    let syncError: string | null = null;
    try {
      // The accounts are handed over so syncItem does not repeat the
      // accountsGet this route already made, and notReadyRetries: 3 caps its
      // not-ready poll at ~6s inside this request instead of the default ~22s
      // (see the budget note in src/lib/plaid.ts and point 2 at the top of this
      // file).
      //
      // Every account Plaid reported, including any that failed to store
      // above: syncItem upserts each one in its own transaction and logs a
      // failure rather than throwing, so this is a free retry of exactly those
      // accounts, and one that succeeds means their transactions land in this
      // first sync instead of the next one.
      //
      // It used to hand over only the accounts that stored, because syncItem
      // did its upserts inside the same transaction as the transactions and
      // the cursor and a known-bad account would have taken the whole sync
      // down with it. That is no longer true, and the filter had a cost of its
      // own: an account left out here is unknown to the sync, so every
      // transaction Plaid sent for it was skipped. syncItem holds the cursor
      // back on a skip now, so those rows are no longer lost either way — but
      // not skipping them at all is better.
      syncResult = await syncItem(itemRow, { plaidAccounts, notReadyRetries: 3 });
    } catch (err) {
      console.error(`Initial sync failed for item ${itemId}:`, err);
      syncError = publicErrorMessage(err, 'Initial sync failed — check the server log');
      const plaidError = plaidErrorBody(err);
      // The recovery write needs its own guard, or it defeats the block it is
      // part of: an unguarded rejection here leaves this catch, reaches the
      // outer one, and returns the 500 this whole structure exists to avoid.
      // The case that does it is the correlated one — the pool is exhausted or
      // a connection was reset, syncItem failed because of that, and this write
      // fails for the same reason. Failing to RECORD the error must not
      // escalate into failing the link, so it is logged and dropped: the item
      // simply carries no error row, and the next sync writes one.
      try {
        await db
          .update(items)
          .set({ error: plaidError ?? { message: syncError }, updatedAt: sql`now()` })
          .where(eq(items.itemId, itemId));
      } catch (writeErr) {
        console.error(`Could not record the initial sync failure for item ${itemId}:`, writeErr);
      }
    }

    // Which accounts are actually missing, asked of the database AFTER the
    // sync rather than inferred from the loop above. syncItem re-attempts every
    // account handed to it (see the note where it is called), so an account
    // that failed there is frequently stored seconds later — and reporting the
    // loop's list verbatim then told the user "1 account(s) not stored" about
    // an account that is on the home page, and undercounted `accounts` to
    // match. Both numbers below come from this reconciled list.
    //
    // Best-effort, like everything else past the commit: if the read itself
    // fails there is nothing to reconcile against, so the loop's list stands as
    // the last thing actually known. Over-reporting a failure is the safe
    // direction — the accounts are all re-upserted by the next sync either way.
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
      // From the write above, not from itemValues (fixed 2026-09-04). The two
      // disagree in precisely the case institutionUpdate exists for:
      // institutionsGetById failed AND plaidItem.institution_name was absent,
      // so itemValues.institutionName is null while the row deliberately KEPT
      // the name already stored. Reporting the null contradicted the row this
      // request had just written. No client reads this field today, so the
      // point is that it stops being a second, wrong answer to a question the
      // row already answers.
      institution_name: storedItem?.institutionName ?? null,
      // What Plaid reported minus what failed to store, so the number is the
      // number of accounts the app actually has.
      accounts: plaidAccounts.length - accountErrors.length,
      transactions: syncResult,
      sync_error: syncError,
      // null rather than [] when every account stored, so the client can test
      // it the same way it tests sync_error.
      account_errors: accountErrors.length > 0 ? accountErrors : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
