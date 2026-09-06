'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { ExchangeResponse, LinkTokenResponse } from '@/lib/api-types';
import { errorMessage, readJson } from '@/lib/http';
import { skippedSyncNotice } from '@/lib/sync-messages';

export default function PlaidLinkButton({
  // The Action suffix is Next's TypeScript-plugin convention for a function
  // prop on a client component; this is a plain callback, not a Server Action.
  onConnectedAction,
  // When "Sync all" last completed with every item clean; null if never.
  syncSucceededAt,
}: {
  onConnectedAction: () => void;
  syncSucceededAt: number | null;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'error'>('idle');
  const [linkError, setLinkError] = useState<string | null>(null);
  // Partial-failure notice after a successful link (the institution IS
  // connected). Design: initial-sync-reported-not-thrown.
  const [syncNotice, setSyncNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);

  // A clean "Sync all" after the notice was raised makes it stale.
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
        const data = await readJson<ExchangeResponse>(res, 'Exchange failed');
        setStatus('idle');
        const accountErrors = data.account_errors ?? [];
        // A re-linked item keeps its stored skip streak, so the exchange-time
        // sync can be the one that drops the held rows. Design: bounded-cursor-hold.
        const skipped = data.transactions?.skipped ?? 0;
        const dropped = data.transactions?.dropped === true;
        const notices = [
          ...(data.sync_error ? [data.sync_error] : []),
          ...(skipped > 0 ? [skippedSyncNotice(skipped, dropped)] : []),
          ...(accountErrors.length > 0
            ? [`${accountErrors.length} account(s) not stored — ${accountErrors.join('; ')}`]
            : []),
        ];
        setSyncNotice(notices.length > 0 ? { message: notices.join(' · '), at: Date.now() } : null);
        onConnectedAction();
      } catch (err) {
        setStatus('error');
        setLinkError(errorMessage(err, 'Exchange failed'));
      }
    },
    [onConnectedAction],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // usePlaidLink needs the token before it becomes ready, so defer opening.
  useEffect(() => {
    if (ready && pendingOpen.current) {
      pendingOpen.current = false;
      open();
    }
  }, [ready, open]);

  const connect = async () => {
    setStatus('loading');
    setLinkError(null);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/link-token', { method: 'POST' });
      const data = await readJson<LinkTokenResponse>(res, 'Failed to create link token');
      pendingOpen.current = true;
      setLinkToken(data.link_token);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setLinkError(errorMessage(err, 'Failed to create link token'));
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
      {status === 'error' && <span> Error: {linkError}</span>}
      {syncNotice && noticeIsCurrent && (
        <span> Connected, but the first sync didn&apos;t finish: {syncNotice.message}</span>
      )}
    </span>
  );
}
