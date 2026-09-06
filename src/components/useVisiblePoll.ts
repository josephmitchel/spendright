'use client';

import { useEffect } from 'react';

// The one polling idiom: run `refresh` every `intervalMs` while the tab is
// visible, and immediately on return to it; both are skipped while hidden.
// Shared by the home and account pages so a background scheduled sync shows
// up on whichever page is open without a reload. Callers pass a refresh that
// writes nothing when superseded, so a poll can never clobber a fresher
// read. Design: home-reflects-background-sync, superseded-loads-write-nothing.
export function useVisiblePoll(refresh: () => void, intervalMs = 60_000): void {
  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) refresh();
    };
    const interval = setInterval(refreshIfVisible, intervalMs);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refresh, intervalMs]);
}
