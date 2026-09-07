'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { ExchangeResponse, LinkTokenResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import { skippedSyncNotice } from '@/lib/sync-messages';

// Design: shared-mutation-protocol.
export function PlaidLinkButton({
  onConnectedAction,
  syncSucceededAt,
}: {
  onConnectedAction: () => void;
  syncSucceededAt: number | null;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  // Design: initial-sync-reported-not-thrown.
  const [syncNotice, setSyncNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);

  // Design: link-notice-expires-on-clean-sync.
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
    // Design: bounded-cursor-hold.
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

  const linkConfig = useMemo(
    () => ({ token: linkToken, onSuccess: exchange.run }),
    [linkToken, exchange.run],
  );
  const { open, ready } = usePlaidLink(linkConfig);

  // usePlaidLink only becomes ready after it has the token, so defer opening.
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
      {/* Design: async-status-announced — wrapper must stay mounted. */}
      <span role="status">
        {connect.pending && ' Opening Plaid Link…'}
        {exchange.pending && ' Connecting and syncing transactions… (this can take a minute)'}
        {syncNotice &&
          noticeIsCurrent &&
          ` Connected, but the first sync didn't finish: ${syncNotice.message}`}
      </span>
      {linkError && <ErrorNotice error={linkError} inline />}
    </span>
  );
}
