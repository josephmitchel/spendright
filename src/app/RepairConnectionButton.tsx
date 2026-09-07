'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { LinkTokenResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';

// Opens Plaid Link in update mode for a broken item. Update mode leaves the
// stored access token valid, so success needs no exchange — just a sync to
// confirm recovery. Design: connection-repair-update-mode.
export function RepairConnectionButton({
  itemId,
  onRepairedAction,
}: {
  itemId: string;
  onRepairedAction: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const pendingOpen = useRef(false);

  const connect = useAsyncAction(async () => {
    const data = await sendJson<LinkTokenResponse>(
      apiPaths.itemLinkToken(itemId),
      'POST',
      undefined,
      'Failed to start the repair',
    );
    pendingOpen.current = true;
    setLinkToken(data.link_token);
  }, 'Failed to start the repair');

  const linkConfig = useMemo(
    () => ({ token: linkToken, onSuccess: () => onRepairedAction() }),
    [linkToken, onRepairedAction],
  );
  const { open, ready } = usePlaidLink(linkConfig);

  // usePlaidLink only becomes ready after it has the token, so defer opening.
  useEffect(() => {
    if (ready && pendingOpen.current) {
      pendingOpen.current = false;
      open();
    }
  }, [ready, open]);

  return (
    <span>
      <button onClick={connect.run} disabled={connect.pending}>
        Fix connection
      </button>
      {/* Design: async-status-announced — wrapper must stay mounted. */}
      <span role="status">{connect.pending && ' Opening Plaid Link…'}</span>
      {connect.error && <ErrorNotice error={connect.error} inline />}
    </span>
  );
}
