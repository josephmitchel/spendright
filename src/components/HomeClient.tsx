'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import PlaidLinkButton from '@/components/PlaidLinkButton';
import { readJson } from '@/lib/http';

interface Item {
  itemId: string;
  institutionName: string | null;
  institutionLogo: string | null;
  error: unknown;
}

interface Account {
  accountId: string;
  itemId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balanceAvailable: string | null;
  balanceCurrent: string | null;
  balanceLimit: string | null;
  isoCurrencyCode: string | null;
}

// items.error holds one of two shapes, both written by the routes that record a
// sync failure (/api/sync and /api/exchange): Plaid's own error body, or
// { message } for anything else. Either way the readable part is a sentence
// meant for this screen — JSON.stringify'ing the whole object buried it in
// braces and quotes, which is how "Plaid is still preparing this account's
// transactions" ended up looking like a crash dump. The stringify stays as the
// fallback: an unrecognized shape is better shown raw than swallowed.
function itemErrorMessage(error: unknown): string {
  const body = error as {
    display_message?: string | null;
    error_message?: string;
    message?: string;
  };
  return body?.display_message || body?.error_message || body?.message || JSON.stringify(error);
}

export default function HomeClient() {
  const [itemList, setItemList] = useState<Item[]>([]);
  const [accountList, setAccountList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  // In-flight guard for "Sync all", the same one the Connect button next to it
  // already has. The button's own status text warns the sync "can take a
  // minute", so a second click while waiting is the expected thing to do, and
  // it was not cheap: two concurrent POST /api/sync read the same items.cursor,
  // pull the same batch from Plaid (wasted quota) and upsert the same rows in
  // overlapping transactions. /api/sync has no 40P01 handling, so when they
  // deadlock the loser writes items.error — and since errorResponse stopped
  // echoing err.message that lands as the generic "Sync failed — check the
  // server log", which then renders under a perfectly healthy institution on
  // every page load until some later sync clears it.
  const [syncing, setSyncing] = useState(false);
  // When "Sync all" last came back with every item clean. Read by
  // PlaidLinkButton, whose connect-time "first sync didn't finish" notice goes
  // stale the moment that happens — see the note where it is set below.
  const [syncSucceededAt, setSyncSucceededAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether /api/items actually came back, on the same principle as the
  // account page's `loaded`: a message that asserts what the database holds is
  // gated on the read that supports it, not on the absence of any error at
  // all. Only this one endpoint has a claim riding on it here, so it is one
  // boolean rather than that page's per-endpoint object.
  const [itemsLoaded, setItemsLoaded] = useState(false);

  // Which refresh is the newest. A generation counter rather than the account
  // page's `cancelled` flag, because that one is scoped to an effect run and
  // only works there: every load on that page goes through the effect, so its
  // cleanup can retire the previous run. refresh() is reachable from four
  // places that are NOT an effect teardown — the mount effect, the Retry
  // button, the un-awaited call at the end of syncAll, and onConnected handed
  // to PlaidLinkButton — so "superseded by a later call" is the thing that has
  // to be expressible, and a boolean cannot say it.
  //
  // What it prevents: a sync clears items.error and syncAll's refresh() returns
  // clean rows, then a Retry the user pressed moments earlier resolves with the
  // PRE-sync body and overwrites itemList — re-rendering "Item error: …" for an
  // error that is already gone, and dragging loadError and itemsLoaded back
  // with it.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    // These are two independent lists, so each endpoint settles on its own —
    // fetch AND parse together, in one promise per endpoint. Splitting them
    // (Promise.all over the fetches, allSettled over the parses) leaves the
    // same bug one layer down: fetch rejects on a reset connection or a failed
    // DNS lookup, and Promise.all turns that into one rejection that discards
    // the sibling response that did arrive.
    //
    // What that costs is out of proportion to the failure: a blip on
    // /api/accounts alone left itemList empty, so the page said "No
    // institutions connected yet". Whichever half arrived is worth rendering.
    // allSettled never rejects, so there is nothing left for a try/catch to do
    // here.
    //
    // Rendering the good half is not recovery on its own, though. When
    // /api/items is the half that failed, itemList is still empty, so "Sync
    // all" is still disabled and refresh() otherwise only runs from the mount
    // effect — which is what the Retry button below is for. Without it the
    // user's only way out of a transient failure is a full page reload.
    const [itemsResult, accountsResult] = await Promise.allSettled([
      fetch('/api/items').then((res) => readJson(res, 'Failed to load institutions')),
      fetch('/api/accounts').then((res) => readJson(res, 'Failed to load accounts')),
    ]);
    // A newer refresh started while this one was in flight, so this one's view
    // of the data is already history. Returning before ANY write keeps the four
    // setState calls below consistent with each other — a partial apply would
    // be worse than none.
    if (seq !== refreshSeq.current) return;
    if (itemsResult.status === 'fulfilled') setItemList(itemsResult.value.items ?? []);
    if (accountsResult.status === 'fulfilled') setAccountList(accountsResult.value.accounts ?? []);
    setItemsLoaded(itemsResult.status === 'fulfilled');
    // And say so on screen. Rendering a half-loaded page as though it were the
    // whole truth is what made the old failure look like an empty account:
    // console.error is not a user surface.
    const failures = [itemsResult, accountsResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    for (const failure of failures) console.error(failure.reason);
    setLoadError(
      failures.length > 0
        ? failures
            .map((f) => (f.reason instanceof Error ? f.reason.message : 'Failed to load'))
            .join('; ')
        : null,
    );
    setLoading(false);
  }, []);

  // Wrapped rather than called bare, which is what react-hooks/set-state-in-effect
  // is asking for. The rule guards against setState running SYNCHRONOUSLY with
  // the effect body and cascading a second render; refresh() has no such call —
  // it returns at the first await and every setState in it runs after
  // Promise.allSettled resolves. The bare call still tripped the rule because a
  // linter cannot see past the function boundary. Making the async boundary
  // explicit is the honest fix, and it matches the load effect on the account
  // page, which has the same shape and passes.
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  const syncAll = async () => {
    setSyncing(true);
    setSyncStatus('Syncing…');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await readJson(res, 'Sync failed');
      const results: { itemId: string; added?: number; error?: string }[] = data.results ?? [];
      const parts = results.map((r) => (r.error ? `${r.itemId}: ${r.error}` : `+${r.added} added`));
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      // A sync in which every item came back clean is what makes the
      // connect-time notice in PlaidLinkButton stale: the item error it
      // described is gone, and the "Item error: …" line below disappears with
      // it, so leaving "the first sync didn't finish" beside the Connect button
      // contradicts the rest of the page. Requiring EVERY item to be clean is
      // deliberate — the notice does not say which item it was about, so any
      // item still failing means it may well still be true. An empty result set
      // is not evidence of anything and does not clear it either.
      if (results.length > 0 && results.every((r) => !r.error)) setSyncSucceededAt(Date.now());
      refresh();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      // Released when the POST settles, not when the refresh() above finishes:
      // that call is deliberately not awaited, and the thing being guarded is a
      // second sync, not a second read.
      setSyncing(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    // Through readJson like every other response on this page. src/lib/http.ts
    // only works as a rule if it is the ONLY way bodies are read, and this was
    // the last consumer still parsing one by hand. The route answers with a
    // JSON body on success ({ deleted }), so the helper's unreadable-response
    // check does not fire on the happy path.
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
      await readJson(res, 'Failed to remove item');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove item');
      return;
    }
    refresh();
  };

  return (
    <main>
      <h1>SpendRight</h1>
      <p>
        <PlaidLinkButton onConnected={refresh} syncSucceededAt={syncSucceededAt} />{' '}
        <button onClick={syncAll} disabled={syncing || itemList.length === 0}>
          Sync all
        </button>
        {syncStatus && <span> {syncStatus}</span>}
      </p>

      {loading && <p>Loading…</p>}
      {loadError && (
        <p>
          Error: {loadError}{' '}
          {/* Cleared on click rather than only when the reload answers: the
              same reason as the Retry on the account page. `loading` is false
              by now and refresh() does not reset it, so a retry that fails
              identically would repaint the same line and read as a dead
              button. */}
          <button
            onClick={() => {
              setLoadError(null);
              refresh();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {/* Only when the read that would show them actually succeeded. Saying
          "nothing connected" on top of a failed /api/items states as fact
          something the page does not know. Keyed on that endpoint alone, not
          on the absence of any error at all: an /api/accounts failure is no
          reason to withhold a true empty state. */}
      {!loading && itemsLoaded && itemList.length === 0 && <p>No institutions connected yet.</p>}

      {itemList.map((item) => {
        const itemAccounts = accountList.filter((a) => a.itemId === item.itemId);
        return (
          <section key={item.itemId}>
            <h2>
              {item.institutionLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${item.institutionLogo}`}
                  alt=""
                  width={24}
                  height={24}
                />
              )}{' '}
              {item.institutionName ?? item.itemId}{' '}
              <button onClick={() => removeItem(item.itemId)}>Remove</button>
            </h2>
            {item.error != null && <p>Item error: {itemErrorMessage(item.error)}</p>}
            <table border={1}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Mask</th>
                  <th>Type</th>
                  <th>Current</th>
                  <th>Available</th>
                  <th>Limit</th>
                </tr>
              </thead>
              <tbody>
                {itemAccounts.map((account) => (
                  <tr key={account.accountId}>
                    <td>
                      <Link href={`/accounts/${account.accountId}`}>
                        {account.name ?? account.officialName ?? account.accountId}
                      </Link>
                    </td>
                    <td>{account.mask}</td>
                    <td>
                      {account.type}
                      {account.subtype ? ` / ${account.subtype}` : ''}
                    </td>
                    <td>{account.balanceCurrent}</td>
                    <td>{account.balanceAvailable}</td>
                    <td>{account.balanceLimit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
