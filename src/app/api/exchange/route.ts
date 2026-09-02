import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, items } from '@/db/schema';
import { resolveCardId } from '@/lib/cards';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import {
  exchangePublicToken,
  getAccounts,
  getInstitutionById,
  getItem,
} from '@/lib/plaid';
import { syncItem } from '@/lib/sync';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const publicToken = body?.public_token;
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

    for (const account of plaidAccounts) {
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
        balanceCurrent:
          account.balances.current != null ? String(account.balances.current) : null,
        balanceLimit: account.balances.limit != null ? String(account.balances.limit) : null,
        isoCurrencyCode: account.balances.iso_currency_code ?? null,
        cardId: await resolveCardId(account.name ?? null),
      };
      await db
        .insert(accounts)
        .values(accountValues)
        .onConflictDoUpdate({
          target: accounts.accountId,
          set: { ...accountValues, updatedAt: sql`now()` },
        });
    }

    const [itemRow] = await db.select().from(items).where(eq(items.itemId, itemId));
    const syncResult = await syncItem(itemRow);

    return NextResponse.json({
      item_id: itemId,
      institution_name: itemValues.institutionName,
      accounts: plaidAccounts.length,
      transactions: syncResult,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
