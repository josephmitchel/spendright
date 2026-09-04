'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { readJson } from '@/lib/http';

export default function PlaidLinkButton({
  onConnected,
  // When "Sync all" last completed with every item clean; null if never.
  syncSucceededAt,
}: {
  onConnected: () => void;
  syncSucceededAt: number | null;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
        const data = await readJson(res, 'Exchange failed');
        setStatus('idle');
        const accountErrors: string[] = Array.isArray(data.account_errors)
          ? data.account_errors.filter((e: unknown): e is string => typeof e === 'string')
          : [];
        // A first sync can hold rows back but never drop them (the skip
        // counter starts at zero), so this is always the "held" wording.
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

  // usePlaidLink needs the token before it becomes ready, so defer opening.
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
