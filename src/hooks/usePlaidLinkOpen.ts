'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';

const LINK_LOAD_TIMEOUT_MS = 15_000;
const LINK_LOAD_FAILURE =
  'Plaid Link failed to load — check your connection (and any ad blocker), then try again.';

// usePlaidLink only becomes ready after it has a token, so opening is deferred:
// every open request sets a fresh token, and that handler's onLoad opens Link.
// `opening` covers the whole wait; a script-load error or timeout ends it with
// `openError` instead of leaving the button silently idle.
export function usePlaidLinkOpen(onSuccess: PlaidLinkOnSuccess) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openRef = useRef<(() => void) | null>(null);

  const linkConfig = useMemo(
    () => ({
      token: linkToken,
      onSuccess,
      onLoad: () => {
        setOpening(false);
        openRef.current?.();
      },
    }),
    [linkToken, onSuccess],
  );
  const { open, error } = usePlaidLink(linkConfig);

  useEffect(() => {
    openRef.current = open as () => void;
  });

  useEffect(() => {
    if (!opening) return;
    // A known script error fails now; otherwise the timeout catches a load
    // that never finishes (network, ad blocker).
    const timer = setTimeout(
      () => {
        setOpening(false);
        setOpenError(LINK_LOAD_FAILURE);
      },
      error ? 0 : LINK_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [opening, error]);

  const openWithToken = (token: string) => {
    setOpenError(null);
    setOpening(true);
    setLinkToken(token);
  };

  return { openWithToken, opening, openError };
}
