'use client';

import { useState } from 'react';

// The load-protocol state every data hook exposes, packaged once so the
// hooks don't each hand-roll the same three states: `settled` flips true
// once the first load settles (success or failure), `error` folds the latest
// load's failures into one on-screen message, and `loaded` records which
// reads actually came back — a failed read is not evidence of anything. The
// staleness guard around a load stays the hook's own (generation counter or
// cancelled flag; design: superseded-loads-write-nothing) — this packages
// only the state the guard writes. Design: partial-load-rendering.
// Keyed on the read names, not the literal initial values, so the flags stay
// plain booleans.
export function useLoadProtocol<K extends string>(initialLoaded: Record<K, boolean>) {
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<K, boolean>>(initialLoaded);
  const clearError = () => setError(null);
  return { settled, setSettled, error, setError, loaded, setLoaded, clearError };
}
