import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cardCategories, cards, items, transactions } from '@/db/schema';
import { matchCard } from '@/lib/cards';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { exchangePublicToken, getAccounts, getInstitutionById, getItem } from '@/lib/plaid';
import { syncItem, type SyncItemResult } from '@/lib/sync';

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
    await db
      .insert(items)
      .values(itemValues)
      .onConflictDoUpdate({
        target: items.itemId,
        set: { ...itemValues, updatedAt: sql`now()` },
      });

    // Fetched once, not per account — matchCard works off the list. Ordered
    // so a match never depends on physical row order.
    const cardList = await db.select().from(cards).orderBy(cards.id);

    for (const account of plaidAccounts) {
      const cardId = matchCard(cardList, account.name ?? null)?.id ?? null;
      const accountValues = {
        accountId: account.account_id,
        itemId,
        name: account.name ?? null,
        officialName: account.official_name ?? null,
        mask: account.mask ?? null,
        type: account.type ?? null,
        subtype: account.subtype ?? null,
        balanceAvailable:
          account.balances.available != null ? String(account.balances.available) : null,
        balanceCurrent: account.balances.current != null ? String(account.balances.current) : null,
        balanceLimit: account.balances.limit != null ? String(account.balances.limit) : null,
        isoCurrencyCode: account.balances.iso_currency_code ?? null,
        cardId,
      };
      // One transaction per account: the category clear below is destructive,
      // so it must not commit unless the card change that justifies it does
      // too — otherwise a later failure leaves selections gone while the
      // account still points at the old card.
      await db.transaction(async (tx) => {
        // A category link belonging to some other card is exactly what a move
        // between cards leaves behind — including a move that passes through
        // "no card", when a Plaid rename drops the match and a later link
        // matches a different card. Keying off the links themselves rather
        // than off the stored card_id catches both shapes; the same rule runs
        // in scripts/seed-cards.ts. An account with no card clears nothing:
        // Plaid account names change cosmetically, and a rename must not
        // destroy the user's selections — the account is merely unsupported
        // until the match comes back (see the supported-account rule at the
        // top of src/app/accounts/[accountId]/page.tsx), and a card actually
        // deleted from the seed already set-nulls those links by FK. Each
        // recorded reward_rate stays either way: it is a snapshot of what that
        // transaction earned. Credit categories are global, so they survive.
        if (cardId !== null) {
          const wiped = await tx
            .update(transactions)
            .set({ cardCategoryId: null, updatedAt: sql`now()` })
            .where(
              and(
                eq(transactions.accountId, account.account_id),
                inArray(
                  transactions.cardCategoryId,
                  tx
                    .select({ id: cardCategories.id })
                    .from(cardCategories)
                    .where(ne(cardCategories.cardId, cardId)),
                ),
              ),
            )
            .returning({ id: transactions.id });
          if (wiped.length > 0) {
            console.log(
              `account "${account.name}" changed card: cleared card categories on ${wiped.length} transaction(s) (rates kept)`,
            );
          }
        }
        await tx
          .insert(accounts)
          .values(accountValues)
          .onConflictDoUpdate({
            target: accounts.accountId,
            set: { ...accountValues, updatedAt: sql`now()` },
          });
      });
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
      syncResult = await syncItem(itemRow);
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

    return NextResponse.json({
      item_id: itemId,
      institution_name: itemValues.institutionName,
      accounts: plaidAccounts.length,
      transactions: syncResult,
      sync_error: syncError,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
