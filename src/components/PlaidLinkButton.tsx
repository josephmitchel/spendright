'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLinkButton({ onConnected }: { onConnected: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Exchange failed');
        setStatus('idle');
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
    try {
      const res = await fetch('/api/link-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to create link token');
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
    </span>
  );
}
