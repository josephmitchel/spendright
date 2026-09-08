'use client';

import { useEffect, useRef } from 'react';

// Design: home-reflects-background-sync, partial-load-rendering.
export function useVisiblePoll(refresh: () => void, intervalMs = 60_000): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) refreshRef.current();
    };
    const interval = setInterval(refreshIfVisible, intervalMs);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [intervalMs]);
}
