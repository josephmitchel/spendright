'use client';

import { useCallback } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { usePlaidLinkOpen } from '@/hooks/usePlaidLinkOpen';
import { apiPaths } from '@/lib/api-paths';
import type { LinkTokenResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';

// Opens Plaid Link in update mode for a broken item. Update mode leaves the
// stored access token valid, so success needs no exchange — just a sync to
// confirm recovery.
export function RepairConnectionButton({
  itemId,
  institutionName,
  onRepairedAction,
}: {
  itemId: string;
  // The institution context a screen reader's buttons list can't get from the
  // surrounding section alone.
  institutionName: string;
  onRepairedAction: () => void;
}) {
  const { openWithToken, opening, openError } = usePlaidLinkOpen(
    useCallback(() => onRepairedAction(), [onRepairedAction]),
  );

  const connect = useAsyncAction(async () => {
    const data = await sendJson<LinkTokenResponse>(
      apiPaths.itemLinkToken(itemId),
      'POST',
      undefined,
      'Failed to start the repair',
    );
    openWithToken(data.link_token);
  }, 'Failed to start the repair');

  const repairError = connect.error ?? openError;

  return (
    <span>
      <button
        onClick={connect.run}
        disabled={connect.pending || opening}
        aria-label={`Fix connection for ${institutionName}`}
      >
        Fix connection
      </button>
      {/* Wrapper must stay mounted. */}
      <span role="status">{(connect.pending || opening) && ' Opening Plaid Link…'}</span>
      {repairError && <ErrorNotice error={repairError} inline />}
    </span>
  );
}
