'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { ExchangeResponse, LinkTokenResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import { skippedSyncNotice } from '@/lib/sync-messages';

// The Connect flow: create a link token, open Plaid Link, exchange the
// public token. Design: shared-mutation-protocol.
export function PlaidLinkButton({
  // The Action suffix is Next's convention for a function prop on a client
  // component; this is a plain callback, not a Server Action.
  onConnectedAction,
  // When "Sync all" last completed with every item clean; null if never.
  syncSucceededAt,
}: {
  onConnectedAction: () => void;
  syncSucceededAt: number | null;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
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

  const exchange = useAsyncAction(async (publicToken: string) => {
    const data = await sendJson<ExchangeResponse>(
      apiPaths.exchange,
      'POST',
      { public_token: publicToken },
      'Exchange failed',
    );
    const accountErrors = data.account_errors ?? [];
    // A re-linked item keeps its skip streak, so this sync can be the one
    // that drops the held rows. Design: bounded-cursor-hold.
    const skipped = data.sync?.skipped ?? 0;
    const dropped = data.sync?.dropped === true;
    const notices = [
      ...(data.sync_error ? [data.sync_error] : []),
      ...(skipped > 0 ? [skippedSyncNotice(skipped, dropped)] : []),
      ...(accountErrors.length > 0
        ? [`${accountErrors.length} account(s) not stored — ${accountErrors.join('; ')}`]
        : []),
    ];
    setSyncNotice(notices.length > 0 ? { message: notices.join(' · '), at: Date.now() } : null);
    onConnectedAction();
  }, 'Exchange failed');

  const connect = useAsyncAction(async () => {
    // A fresh attempt clears the previous attempt's leftovers.
    exchange.clearError();
    setSyncNotice(null);
    const data = await sendJson<LinkTokenResponse>(
      apiPaths.linkToken,
      'POST',
      undefined,
      'Failed to create link token',
    );
    pendingOpen.current = true;
    setLinkToken(data.link_token);
  }, 'Failed to create link token');

  // Memoized so the config passed to usePlaidLink only changes with the token.
  const linkConfig = useMemo(
    () => ({ token: linkToken, onSuccess: exchange.run }),
    [linkToken, exchange.run],
  );
  const { open, ready } = usePlaidLink(linkConfig);

  // usePlaidLink needs the token before it becomes ready, so defer opening.
  useEffect(() => {
    if (ready && pendingOpen.current) {
      pendingOpen.current = false;
      open();
    }
  }, [ready, open]);

  const linkError = connect.error ?? exchange.error;

  return (
    <span>
      <button onClick={connect.run} disabled={connect.pending || exchange.pending}>
        Connect a bank
      </button>
      {connect.pending && <span> Opening Plaid Link…</span>}
      {exchange.pending && (
        <span> Connecting and syncing transactions… (this can take a minute)</span>
      )}
      {linkError && <ErrorNotice error={linkError} inline />}
      {syncNotice && noticeIsCurrent && (
        <span> Connected, but the first sync didn&apos;t finish: {syncNotice.message}</span>
      )}
    </span>
  );
}
