'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { readJson } from '@/lib/http';

export default function PlaidLinkButton({
  onConnected,
  // When the last "Sync all" completed with every item clean, from HomeClient.
  // null means no such sync has happened this session.
  syncSucceededAt,
}: {
  onConnected: () => void;
  syncSucceededAt: number | null;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // /api/exchange returns 200 with sync_error, account_errors and/or a
  // transactions.skipped count when the link itself succeeded but part of the
  // work after it did not, so this is reported apart from `status` — the
  // institution IS connected, and calling the whole thing a failure would send
  // the user off to re-link something that is already there.
  //
  // The wording stays neutral about what to do next, because this covers every
  // way the first sync can fail, not just the common one. Plaid not having
  // prepared the transactions clears on its own; an ITEM_LOGIN_REQUIRED needs
  // the user to re-authenticate; a database error needs someone to look at the
  // log. "No transactions yet" would tell the last two to sit and wait. The
  // specific message carries the difference, so the frame around it should not
  // guess.
  //
  // Carries the moment it was raised, because a later successful "Sync all"
  // makes it stale: that sync clears the item's error, the "Item error: …" line
  // under the institution disappears, and this notice was left contradicting
  // the rest of the page with no way to dismiss it short of connecting again.
  const [syncNotice, setSyncNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);

  // Derived during render rather than cleared by an effect. Keeping the two
  // facts independent — when this notice was raised, when a sync last came back
  // clean — is what makes the comparison correct in both directions: a sync
  // that succeeded BEFORE this connect does not suppress a fresh notice, which
  // a one-way "clear it" signal would have done.
  const noticeIsCurrent =
    syncNotice != null && (syncSucceededAt == null || syncSucceededAt < syncNotice.at);
  const pendingOpen = useRef(false);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setStatus('exchanging');
      try {
        const res = await fetch('/api/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken }),
        });
        const data = await readJson(res, 'Exchange failed');
        setStatus('idle');
        // Three partial failures share this one notice: the first sync
        // throwing, the first sync holding its cursor back, and an account that
        // could not be stored (/api/exchange reports all three rather than
        // throwing, because the link itself succeeded either way). Joined into
        // one line because the frame around them — "Connected, but …" — is true
        // of all of them, and a second notice beside it would just be the same
        // sentence twice.
        const accountErrors: string[] = Array.isArray(data.account_errors)
          ? data.account_errors.filter((e: unknown): e is string => typeof e === 'string')
          : [];
        // The quiet one: the sync SUCCEEDED — nothing threw, so sync_error is
        // null — but rows arrived for an account that is not stored, so syncItem
        // held the item's cursor back and they have not landed yet (see the
        // cursor note in src/lib/sync.ts). Without this the notice said nothing
        // about a first sync that did not, in fact, finish. It is the same
        // condition syncItem writes to items.error and the home page renders
        // under the institution; carrying it here too keeps the two halves of
        // the screen agreeing, and is why HomeClient's syncSucceededAt requires
        // !r.skipped — otherwise the next "Sync all" would clear this notice
        // while the rows were still being held.
        //
        // Always the held case, never the dropped one: syncItem drops a batch
        // only after MAX_SKIPPED_SYNCS consecutive skips, and this is a brand
        // new item whose counter starts at zero, so a first sync cannot reach
        // it. The home page's sync status handles the dropped wording.
        const skipped =
          typeof data.transactions?.skipped === 'number' ? data.transactions.skipped : 0;
        const notices = [
          ...(typeof data.sync_error === 'string' ? [data.sync_error] : []),
          ...(skipped > 0
            ? [
                `${skipped} transaction(s) held for accounts that aren’t stored yet — they’ll be retried on the next sync`,
              ]
            : []),
          ...(accountErrors.length > 0
            ? [`${accountErrors.length} account(s) not stored — ${accountErrors.join('; ')}`]
            : []),
        ];
        setSyncNotice(notices.length > 0 ? { message: notices.join(' · '), at: Date.now() } : null);
        onConnected();
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Exchange failed');
      }
    },
    [onConnected],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // The usePlaidLink hook needs the token before it becomes ready, so
  // defer opening until it is.
  useEffect(() => {
    if (ready && pendingOpen.current) {
      pendingOpen.current = false;
      open();
    }
  }, [ready, open]);

  const connect = async () => {
    setStatus('loading');
    setErrorMessage(null);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/link-token', { method: 'POST' });
      const data = await readJson(res, 'Failed to create link token');
      pendingOpen.current = true;
      setLinkToken(data.link_token);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create link token');
    }
  };

  return (
    <span>
      <button onClick={connect} disabled={status === 'loading' || status === 'exchanging'}>
        Connect a bank
      </button>
      {status === 'loading' && <span> Opening Plaid Link…</span>}
      {status === 'exchanging' && (
        <span> Connecting and syncing transactions… (this can take a minute)</span>
      )}
      {status === 'error' && <span> Error: {errorMessage}</span>}
      {syncNotice && noticeIsCurrent && (
        <span> Connected, but the first sync didn&apos;t finish: {syncNotice.message}</span>
      )}
    </span>
  );
}
