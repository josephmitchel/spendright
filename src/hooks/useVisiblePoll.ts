'use client';

import { useEffect, useRef } from 'react';

// Runs `refresh` every `intervalMs` while the tab is visible, and
// immediately on return to it; both are skipped while hidden.
// Design: home-reflects-background-sync, superseded-loads-write-nothing.
export function useVisiblePoll(refresh: () => void, intervalMs = 60_000): void {
  // A ref, so an unmemoized `refresh` doesn't tear the interval down every
  // render.
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
