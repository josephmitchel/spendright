'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';

// usePlaidLink only becomes ready after it has a token, so opening is deferred
// until then. Returns a setter that opens Link once the given token is ready.
export function usePlaidLinkOpen(onSuccess: PlaidLinkOnSuccess) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const pendingOpen = useRef(false);

  const linkConfig = useMemo(() => ({ token: linkToken, onSuccess }), [linkToken, onSuccess]);
  const { open, ready } = usePlaidLink(linkConfig);

  useEffect(() => {
    if (ready && pendingOpen.current) {
      pendingOpen.current = false;
      open();
    }
  }, [ready, open]);

  return (token: string) => {
    pendingOpen.current = true;
    setLinkToken(token);
  };
}
