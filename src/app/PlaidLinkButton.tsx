'use client';

import { useState } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { usePlaidLinkOpen } from '@/hooks/usePlaidLinkOpen';
import { apiPaths } from '@/lib/api-paths';
import type { ExchangeResponse, LinkTokenResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import { skippedSyncNotice } from '@/lib/sync-messages';

export function PlaidLinkButton({
  onConnectedAction,
  syncSucceededAt,
}: {
  onConnectedAction: () => void;
  syncSucceededAt: number | null;
}) {
  const [syncNotice, setSyncNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);

  const noticeIsCurrent =
    syncNotice != null && (syncSucceededAt == null || syncSucceededAt < syncNotice.at);

  const exchange = useAsyncAction(async (publicToken: string) => {
    const data = await sendJson<ExchangeResponse>(
      apiPaths.exchange,
      'POST',
      { public_token: publicToken },
      'Exchange failed',
    );
    const accountErrors = data.account_errors ?? [];
    const skipped = data.sync?.skipped ?? 0;
    const dropped = data.sync?.dropped === true;
    const notices = [
      ...(data.sync_error ? [data.sync_error] : []),
      ...(skipped > 0 ? [skippedSyncNotice(skipped, dropped)] : []),
      ...(accountErrors.length > 0
        ? [`${accountErrors.length} account(s) not stored — ${accountErrors.join('; ')}`]
        : []),
    ];
    // A setup failure happens before any sync attempt, so its notice must not
    // claim a sync ran; that message is already a complete sentence.
    const prefix = data.setup_failed ? '' : "Connected, but the first sync didn't finish: ";
    setSyncNotice(
      notices.length > 0 ? { message: `${prefix}${notices.join(' · ')}`, at: Date.now() } : null,
    );
    onConnectedAction();
  }, 'Exchange failed');

  const openWithToken = usePlaidLinkOpen(exchange.run);

  const connect = useAsyncAction(async () => {
    exchange.clearError();
    setSyncNotice(null);
    const data = await sendJson<LinkTokenResponse>(
      apiPaths.linkToken,
      'POST',
      undefined,
      'Failed to create link token',
    );
    openWithToken(data.link_token);
  }, 'Failed to create link token');

  const linkError = connect.error ?? exchange.error;

  return (
    <span>
      <button onClick={connect.run} disabled={connect.pending || exchange.pending}>
        Connect a bank
      </button>
      {/* Wrapper must stay mounted. */}
      <span role="status">
        {connect.pending && ' Opening Plaid Link…'}
        {exchange.pending && ' Connecting and syncing transactions… (this can take a minute)'}
        {syncNotice && noticeIsCurrent && ` ${syncNotice.message}`}
      </span>
      {linkError && <ErrorNotice error={linkError} inline />}
    </span>
  );
}
